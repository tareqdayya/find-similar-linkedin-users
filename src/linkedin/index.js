// scraping linked-in users and their employers before saving them to database
import pg from 'pg';
const { Client } = pg;
import { chromium } from "playwright";
import { waitFor, waitForRandom, pickRandomArrayElement } from '../common.js';
import { naturalMouseEvents } from '../consts.js';

// keep lowercase
const interestingJobPositions = ['data', 'analytics', 'science', 'ai', 'machine', 'artificial', 'deep', 'learning', 'nlp', 'natural', 'language', 'processing', 'computer', 'vision', 'cv', 'image', 'recognition', 'sp', 'front-end', 'frontend', 'front end', 'backend', 'back-end', 'backend', 'full stack', 'full-stack', 'fullstack', 'software engineer', 'software engineering', 'software', 'it', 'information technology', 'audio', 'game', 'dev', 'development', 'developer', 'founder', 'co-founder', 'co founder', 'cofounder', 'hacker', 'vr', 'ar', 'augmented', 'reality', 'devops', 'principal engineer', 'designer', 'product design', 'mechatronics', 'robotics', 'design verification', 'dv', 'embedded', 'cloud', 'team lead', 'tech', 'mobile', 'application', 'android', 'react', 'macos', 'ios', 'c++', 'cpp', 'react native', 'ux', 'javascript', 'typescript', 'node.js', 'python', 'flutter', 'mern'];
const blacklistedPositions = ['architect', 'architecture', 'architectural', 'interior', 'exterior', 'student', 'civil', 'water']

//
let client;
const connectToDb = async () => {
    const client = new Client({
        host: process.env.POSTGRES_DB_HOST,
        user: process.env.POSTGRES_DB_USER,
        password: process.env.POSTGRES_DB_PASSWORD,
        database: process.env.POSTGRES_DB_NAME,
        port: parseInt(process.env.POSTGRES_DB_PORT || "5432"),
        connectionTimeoutMillis: 1200000,
        keepAlive: true
    })
    await client.connect()

    return client
};

const runPostGreSqlQuery = async (query) => {
    try {
        const res = await client.query(query);
        console.log('SQL QUERY RESPONSE:', res.rows);
        return res;
    } catch (error) {
        console.log('error trying to make a sql query. Query:', query);
        console.log('error:', error);
    }
};

const migrateDb = async () => {
    await runPostGreSqlQuery({
        text: `CREATE TABLE IF NOT EXISTS users (
            id SERIAL UNIQUE NOT NULL,
            url VARCHAR(255),
            full_name VARCHAR(255) NOT NULL,
            job_position VARCHAR(255) NOT NULL,
            geo_location VARCHAR(255) NOT NULL,
            PRIMARY KEY(url)
        )`
    })
    await runPostGreSqlQuery({
        text: `CREATE TABLE IF NOT EXISTS user_experience (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            experience VARCHAR(255) NOT NULL,
            CONSTRAINT fk_user
                FOREIGN KEY(user_id) 
                    REFERENCES users(id)
        )`
    })
    await runPostGreSqlQuery({
        text: `CREATE TABLE IF NOT EXISTS dumped_people_also_viewed (
            id SERIAL PRIMARY KEY,
            position VARCHAR(255) NOT NULL
            )`
    })
}

const insertUserIntoDb = async (user, experiences) => {
    const urlWithoutTrailingSlash = user.url.endsWith('/') ? user.url.slice(0, -1) : user.url;
    const query = {
        text: `INSERT INTO users (url, full_name, job_position, geo_location) 
        SELECT $1, $2, $3, $4
        WHERE
        NOT EXISTS (
            SELECT url FROM users WHERE url = $1
        )
        RETURNING *`,
        values: [urlWithoutTrailingSlash, user.name, user.jobPosition, user.location]
    };
    const { rows } = await runPostGreSqlQuery(query);

    const { id } = rows[0] ?? {};
    // no id means user already exists in db so no record was created
    if (id) {
        const query = {
            text: `INSERT INTO user_experience (user_id, experience) 
            VALUES${experiences.map((_, i) => `($1, $${i + 2})`).join(', ')}
            RETURNING *`,
            values: [id, ...experiences.map((experience) => experience.join(', '))]
        };

        await runPostGreSqlQuery(query);
    }
};

const saveDumpedPersonsAlsoViewedToDb = async (personsAlsoViewed) => {
    const positions = personsAlsoViewed.map((person) => person.position);
    const query = {
        text: `INSERT INTO dumped_people_also_viewed (position)
        VALUES${positions.map((_, i) => `($${i + 1})`).join(', ')}
        RETURNING *`,
        values: [...positions]
    };
    await runPostGreSqlQuery(query);
};

const getPersonsNewToUs = async (personsAlsoViewed) => {
    const personsNotInDb = [];

    const query = {
        text: `SELECT * FROM users WHERE url in (${personsAlsoViewed.map((_, i) => `$${i + 1}`).join(', ')})`,
        values: personsAlsoViewed.map((person) => person.url)
    };
    const { rows } = await runPostGreSqlQuery(query);
    for (const person of personsAlsoViewed) {
        if (!rows.find((row) => row.url === person.url)) {
            personsNotInDb.push(person);
        }
    }

    return personsNotInDb;
};

//

const scrollRandomDistance = async (page, direction) => {
    const randomDistance = Math.floor(300 + Math.random() * 600);
    await page.mouse.wheel(0, direction === 'up' ? -randomDistance : randomDistance);
};

const moveMouseRandomly = async (page) => {
    const randomX = Math.floor(300 + Math.random() * 400);
    const randomY = Math.floor(500 + Math.random() * 400);
    await page.mouse.move(randomX, randomY, { steps: Math.floor(20 + Math.random() * 20) });
    await waitFor(50 + Math.random() * 100);
};

const pretendToBeHuman = async (page) => {
    await scrollRandomDistance(page, 'down');
    await moveMouseRandomly(page);
    if (Math.random() < 0.75) await moveMouseRandomly(page);

    if (Math.random() < 0.5) {
        await scrollRandomDistance(page, 'up');
        await moveMouseRandomly(page);
    }

    await waitForRandom();
};

const isPositionDesirable = (position) => {
    const positionWords = position.toLowerCase().split(' ');
    return interestingJobPositions.some((interestingPosition) => positionWords.includes(interestingPosition)) && !blacklistedPositions.some((blacklistedPosition) => positionWords.includes(blacklistedPosition));
}

// name, job position and geo-location
const parseSectionOne = async (page) => {
    const sectionOne = await page.$$eval('.pv-text-details__left-panel', (options) => {
        return options.map(option => option.textContent);
    });

    for (let index = 0; index < sectionOne.length; index++) {
        sectionOne[index] = sectionOne[index].split('\n').map((str) => str.trim()).filter(Boolean);
    }

    const [nameAndJobPosition, geoLocation] = sectionOne

    const name = nameAndJobPosition[0];
    const jobPosition = nameAndJobPosition.slice(-1)[0];
    const location = geoLocation[0];

    if (!name || !jobPosition || !location) throw new Error(`could not parse section one for url: ${page.url()}`)

    return { name, jobPosition, location, url: page.url() };
};

const parseExperienceSection = async (page) => {
    const experienceSection = await page.locator('section', { has: page.getByRole('heading', { name: 'Experience' }) });
    await experienceSection.waitFor();

    const experienceListItems = await experienceSection.getByRole('list').first().locator('> li');

    const experiences = [];
    for (const li of await experienceListItems.all()) {
        let experience = await li.innerText();
        experience = experience.split('\n').map((str) => str.trim()).filter(Boolean);

        const uniqueExperience = Array.from(new Set(experience));

        // invalid lists don't have yr or mos.
        if (!uniqueExperience.find((str) => str.includes('yr') || str.includes('mos'))) continue;

        const removeLogoPlaceholder = uniqueExperience.filter(line => !line.endsWith('logo'));

        experiences.push(removeLogoPlaceholder);
    }

    return experiences;
};

const goToNextPerson = async (page) => {
    const alsoViewedSection = await page.locator('section', { hasText: 'People also viewed' });
    await alsoViewedSection.waitFor();

    // OLD METHOD. Now we get a "Show all" button.
    // const showMoreCta = await alsoViewedSection.getByText('Show more');
    // await showMoreCta.waitFor();
    // await showMoreCta.click();
    // const personItems = await alsoViewedSection.getByRole('listitem');

    const showAll = await alsoViewedSection.getByText('Show all');
    await showAll.waitFor();
    if (Math.random() > 0.5) await showAll.hover();
    await showAll.click();
    const dialog = await page.getByRole('dialog').first();
    await dialog.getByRole('listitem').first().waitFor();
    const personItems = await dialog.getByRole('listitem');

    await waitForRandom();

    // scroll for a bit in the dialog + move mouse randomly
    const scrollContainer = await dialog.locator('> div:last-of-type');
    await scrollContainer.evaluate(async (el) => {
        el.scrollBy({ top: 200 + Math.random() * 200, behavior: 'smooth' });
        await (async (ms) => new Promise((resolve) => setTimeout(resolve, ms)))(50 + Math.floor(Math.random() * 100));
        el.scrollBy({ top: 200 + Math.random() * 200, behavior: 'smooth' });
    });
    const naturalMouseMoveEvents = naturalMouseEvents.filter(event => event.type === 'mousemove')
    await scrollContainer.dispatchEvent('mousemove', naturalMouseMoveEvents[Math.floor(Math.random() * naturalMouseMoveEvents.length)]);

    const persons = [];
    for (const li of await personItems.all()) {
        let person = await li.innerText();
        person = person.split('\n').map((str) => str.trim()).filter((el) => !!el && !['Follow', 'Message', 'Connect'].includes(el));

        if (person.length <= 1) continue;

        const link = await li.getByRole('link');
        const href = await link.first().getAttribute('href');

        const name = person[1];
        const position = person.slice(-1)[0];
        persons.push({ name, position, url: href, element: li });
    }

    // filter by job position!
    const interestingPersons = [];
    const nonInterestingPersons = [];
    persons.forEach((person) => {
        if (isPositionDesirable(person.position)) interestingPersons.push(person);
        else nonInterestingPersons.push(person);
    });

    console.log('interestingPersons found:', interestingPersons)

    if (nonInterestingPersons.length) {
        await saveDumpedPersonsAlsoViewedToDb(nonInterestingPersons);
    }

    const personsNotInDb = await getPersonsNewToUs(interestingPersons);

    await pretendToBeHuman(page);

    // Close the dialog and throw (so caller can navigate back) if no one is interesting
    if (!personsNotInDb.length) {
        // close dialog first before we navigate away. Else going back we will go back to overlay
        const closeIcon = await dialog.getByRole('button', { name: 'Dismiss' });
        await closeIcon.click();

        throw new Error('No interesting next person found!')
    }

    const personToClick = pickRandomArrayElement(personsNotInDb);

    const link = await personToClick.element.locator('a').first();
    await link.click();
    await page.waitForURL(`**/${personToClick.url.split('/').slice(-1)[0]}/`);
    onPageLoaded(page);
};

const parsePage = async (page) => {
    try {
        await pretendToBeHuman(page);

        const user = await parseSectionOne(page);
        if (user.location.toLowerCase().includes('israel')) throw new Error(`User is of undesired location ${user.location}`);

        const experiences = await parseExperienceSection(page);

        if (experiences.length && isPositionDesirable(user.jobPosition)) {
            await insertUserIntoDb(user, experiences);
        }

        console.log('person:', { user, experiences });

        await goToNextPerson(page);
    } catch (e) {
        console.error('Error parsing page. Going back. Error:', e);
        await page.goBack();
        await page.goBack(); // twice since we have an x dialog
        onPageLoaded(page);
    }
};

async function onPageLoaded(page) {
    console.log('*** page loaded!!! ***', page.url());
    await waitForRandom();
    parsePage(page);
};

const runLinkedIn = async () => {
    client = await connectToDb();
    await migrateDb();

    const browserURL = `http://docker.for.mac.localhost:9222`;
    const browser = await chromium.connectOverCDP(browserURL);
    const ctx = await browser.contexts()[0];
    const page = await ctx.pages()[0];

    page.setDefaultTimeout(5000);
    page.setDefaultNavigationTimeout(15000);

    page.on('load', onPageLoaded);
    page.on('close', async () => {
        console.log('page closed!!');
        await client.end();
    });

    await page.goto(process.env.USER_URL_TO_START_AT, { waitUntil: 'domcontentloaded' });
};

export default runLinkedIn;

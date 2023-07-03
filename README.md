# find-similar-linkedin-users
Finds linked in users similar to a profile you point it to and adds them to db. Everything is running inside of a docker container, including the postgres db where the data will be.

# Prerequisites:
You must have docker installed on your machine. In addition to that, you need a chrome or chrome canary browser.

# .env file:
Please add an .env file to the root directory. Here's a sample one.

```
POSTGRES_DB_USER='postgres'
POSTGRES_DB_PASSWORD='password'
POSTGRES_DB_HOST='db'
POSTGRES_DB_NAME='linkedin'
POSTGRES_DB_PORT=5432

PORT=3000
```

# Running chrome:
From your machine's terminal, run chrome (canary) with remote debugging enabled for port `9222`. For a canary running on MacOs, this is the script you would run. Google search how to run your browser on your OS:

`"/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary" --remote-debugging-port=9222 --no-first-run --no-default-browser-check --user-data-dir=$(mktemp -d -t 'chrome-remote_data_dir')`

This will enable you to sign in once and continue using the browser across bot restarts. We don't want bot detectors to catch us, do we now?

Once the browser is open, sign in into linked in. It's better to use an account that's not yours just in case you get detected and penalized (your account will be temporarily blocked). Please use a premium account since regular accounts have a limit on how many searches you can do per month which you will run through quite quickly; another reason to using a separate account for this bot.

# Exposing the host to the docker container so we can access the running chrome
Run the following script:

`docker network create -d bridge --subnet 192.168.1.0/24 --gateway 192.168.1.12 dockernet`

# Running the docker server:

`docker-compose run --service-ports app /bin/sh`

once inside:

`yarn install && yarn start`

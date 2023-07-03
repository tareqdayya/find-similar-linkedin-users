import getUrls from 'get-urls';
import parser from 'parse-address';
import parseAddress from 'parse-address-string'
import extractEmail from 'extract-email-address';
import { findPhoneNumbersInText } from 'libphonenumber-js';
import addresser from 'addresser';

export const getLinks = (text) => {
  const urls = getUrls(text);
  return Array.from(urls);
};

export const getEmails = (text) => {
  const emails = extractEmail(text);
  if (emails && emails.length) return emails.map((e) => e.email);
  return [];
};

export const getAddresses = async (text) => new Promise(((resolve, reject) => {
  parseAddress(text, (err, data) => {
    const firstParser = { ...(err ? {} : data) };

    const secondParser = parser.parseLocation(text);

    let thirdParser;
    try {
      thirdParser = addresser.parseAddress(text);
    } catch (e) { }

    resolve({ firstParser, secondParser, thirdParser: thirdParser || {} });
  });
}));

export const getPhoneNumbers = (text) => {
  let parsedArray = findPhoneNumbersInText(text, 'US') || [];
  if (parsedArray.length) {
    parsedArray = parsedArray.map((a) => {
      if (a.number) return a.number.number;
      return undefined;
    });
  }

  return parsedArray;
};

export const transformClassesToSelector = (string) => string.split(' ').join(', .');

export const waitFor = async (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const waitForRandom = async (min=2.5, max=5) => await waitFor(Math.floor(Math.random() * (max - min) + min) * 1000);

export const pickRandomArrayElement = (array) => array[Math.floor(Math.random() * array.length)];

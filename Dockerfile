# Installs Node.js image
FROM node:18-alpine

RUN apk add python3 py3-pip

# sets the working directory for any RUN, CMD, COPY command
# all files we put in the Docker container running the server will be in /usr/src/app (e.g. /usr/src/app/package.json)
WORKDIR /usr/src/app

COPY        package.json ./
COPY        yarn.lock ./

# Installs all packages
RUN set -ex; \
    yarn install; \
    yarn cache clean;

COPY        src ./

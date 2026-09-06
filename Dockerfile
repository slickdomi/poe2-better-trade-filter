FROM node:22-alpine

# node:22-alpine ships npm 10.x, which predates the `min-release-age` config
# (see .npmrc) that enforces this project's dependency-cooldown policy.
RUN npm install -g npm@12.0.2

WORKDIR /app

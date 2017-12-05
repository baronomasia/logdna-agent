# Use the alpine node runtime as a parent image
FROM mhart/alpine-node:6.11.3

# List the maintainer
MAINTAINER Lee Liu <lee@logdna.com>

# Install dependencies
RUN apk add -qU \
  git \
  g++ \
  make \
  python

# Configure logdna-agent
WORKDIR /opt/logdna-agent
ADD logdna-agent .
RUN npm install
CMD node index.js

# Dockerfile

FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (if you have)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy backend code and public folder
COPY server.js .
COPY public ./public

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "server.js"]
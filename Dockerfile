# Use official Node.js 18 alpine image for small size
FROM node:18-alpine

# Set working directory inside container
WORKDIR /app

# Install bash for debugging (optional)
RUN apk add --no-cache bash

# Copy package files first (for caching npm install)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all other source files
COPY . .

# Expose your app port (adjust if needed)
EXPOSE 3000

# Start the app
CMD ["npm", "start"]

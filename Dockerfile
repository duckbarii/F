# Use official Node.js runtime (Alpine slim version)
FROM node:18-alpine

# Set working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json (if exists)
COPY package*.json ./

# Install app dependencies
RUN npm install

# Copy all source files
COPY . .

# Expose port your app will listen on
EXPOSE 3000

# Start the app
CMD ["node", "app.js"]

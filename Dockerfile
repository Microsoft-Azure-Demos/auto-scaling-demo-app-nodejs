
# Use the official Node.js 22 Alpine image as the base image
FROM node:22-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package files first to optimize Docker layer caching
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy the application source code into the container
COPY . .

# Change ownership so the non-root Node.js user can access the application
RUN chown -R node:node /app

# Run the application as a non-root user for better security
USER node

# Document the port used by the Express application
EXPOSE 3000

# Start the application
CMD ["npm", "start"]

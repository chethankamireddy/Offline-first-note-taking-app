# Production Dockerfile for NoteSync (Single-service deployment)
FROM node:20-alpine

WORKDIR /app

# Copy package descriptors
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# Install dependencies for root, server, and client
RUN npm run install:all

# Copy full application source code
COPY . .

# Build the client into client/dist
RUN npm run build

# Expose default port
ENV PORT=5000
ENV NODE_ENV=production
EXPOSE 5000

# Start Express server (serves both API and static frontend)
CMD ["npm", "start"]

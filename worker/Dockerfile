# Greenroom Preview Worker
FROM node:20-slim

# Install ffmpeg and openssl (needed for Prisma)
RUN apt-get update && \
    apt-get install -y ffmpeg openssl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm install

# Generate Prisma client
RUN npx prisma generate

# Copy source
COPY . .

# Run the worker
CMD ["node", "index.js"]

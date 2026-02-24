# Greenroom Preview Worker
FROM node:20-slim

# Install ffmpeg and openssl (needed for Prisma)
RUN apt-get update && \
    apt-get install -y ffmpeg openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy everything
COPY . .

# Install dependencies (postinstall runs prisma generate)
RUN npm install

# Run the worker
CMD ["node", "index.js"]

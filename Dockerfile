FROM node:20-slim

# Install dependencies for sqlite3 build
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy the rest of the application
COPY . .

# Create data directory for persistence
RUN mkdir -p data

# Set timezone
ENV TZ=America/Sao_Paulo

# Start the application
CMD ["npm", "start"]

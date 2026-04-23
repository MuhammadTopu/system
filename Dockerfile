FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8787

# Install dependencies first for better Docker layer caching
COPY package*.json ./
RUN npm ci

# Generate Prisma client at build time
COPY prisma ./prisma
RUN npx prisma generate

# Copy the rest of the application
COPY . .

# Ensure upload directory exists in container
RUN mkdir -p uploads

EXPOSE 8787

# Apply migrations, then start the API
CMD ["sh", "-c", "npx prisma migrate deploy && node index.js"]

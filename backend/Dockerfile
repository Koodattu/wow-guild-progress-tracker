FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Build TypeScript
RUN npm run build

# Set production environment
ENV NODE_ENV=production

EXPOSE 3001

CMD ["npm", "start"]
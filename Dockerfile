FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache libreoffice ttf-dejavu fontconfig

COPY package*.json ./
RUN npm install

COPY . .

CMD ["npm", "start"]
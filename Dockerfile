FROM node:18-alpine
WORKDIR /app

# LibreOffice — pdfEngine.js .pptx faylni PDF'ga o'girish uchun "soffice"
# buyrug'ini ishlatadi, u shu paket bilan birga keladi. ttf-dejavu/fontconfig —
# PDF'da matnlar to'g'ri (bo'sh joy/artefaktsiz) chiqishi uchun kerak.
RUN apk add --no-cache libreoffice ttf-dejavu fontconfig

COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "run", "start"]
FROM node:20-slim

# Устанавливаем LibreOffice (нужен только для конвертации .pptx -> .pdf)
# --no-install-recommends заметно уменьшает размер образа
RUN apt-get update && \
    apt-get install -y --no-install-recommends libreoffice-impress && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

CMD ["node", "index.js"]

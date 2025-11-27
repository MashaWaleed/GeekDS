FROM node:20-alpine
WORKDIR /app

# Install ADB for device enrollment and ffmpeg for screenshot generation
RUN apk add --no-cache android-tools ffmpeg

COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 5000
CMD ["npm", "run", "dev"] 
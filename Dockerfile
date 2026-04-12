FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .


ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=7860
ENV TICK_RATE=30
ENV ROUND_RESET_SECONDS=8
ENV OVERLAY_TRANSPARENT=false

EXPOSE 7860

CMD ["npm", "start"]

FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

RUN mkdir -p assets/sounds \
  && wget -q -O assets/sounds/gasing-spin-1.mp3 https://assets.mixkit.co/active_storage/sfx/1613/1613-preview.mp3 || true \
  && wget -q -O assets/sounds/gasing-spin-whoosh.mp3 https://assets.mixkit.co/active_storage/sfx/2650/2650-preview.mp3 || true \
  && wget -q -O assets/sounds/gasing-whoosh-attack-1.mp3 https://assets.mixkit.co/active_storage/sfx/1485/1485-preview.mp3 || true \
  && wget -q -O assets/sounds/gasing-whoosh-attack-2.mp3 https://assets.mixkit.co/active_storage/sfx/1487/1487-preview.mp3 || true \
  && wget -q -O assets/sounds/gasing-metal-hit-1.mp3 https://assets.mixkit.co/active_storage/sfx/2160/2160-preview.mp3 || true \
  && wget -q -O assets/sounds/gasing-metal-hit-2.mp3 https://assets.mixkit.co/active_storage/sfx/2792/2792-preview.mp3 || true \
  && wget -q -O assets/sounds/gasing-impact-heavy.mp3 https://assets.mixkit.co/active_storage/sfx/1143/1143-preview.mp3 || true \
  && wget -q -O assets/sounds/gasing-ultimate-impact.mp3 https://assets.mixkit.co/active_storage/sfx/2908/2908-preview.mp3 || true \
  && wget -q -O assets/sounds/ultimate-energy-charge.mp3 https://assets.mixkit.co/active_storage/sfx/2589/2589-preview.mp3 || true \
  && wget -q -O assets/sounds/ultimate-cinematic-rise.mp3 https://assets.mixkit.co/active_storage/sfx/488/488-preview.mp3 || true \
  && wget -q -O assets/sounds/ultimate-explosion-boom.mp3 https://assets.mixkit.co/active_storage/sfx/2782/2782-preview.mp3 || true \
  && wget -q -O assets/sounds/ultimate-magic-burst.mp3 https://assets.mixkit.co/active_storage/sfx/873/873-preview.mp3 || true \
  && wget -q -O assets/sounds/battle-bgm.mp3 https://assets.mixkit.co/music/676/676.mp3 || true

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=7860
ENV TICK_RATE=30
ENV ROUND_RESET_SECONDS=8
ENV OVERLAY_TRANSPARENT=false

EXPOSE 7860

CMD ["npm", "start"]

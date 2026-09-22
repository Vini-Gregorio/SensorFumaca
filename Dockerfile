FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --chown=node:node backend ./backend
COPY --chown=node:node public ./public
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node db ./db
USER node
EXPOSE 3001
CMD ["node", "backend/server.js"]

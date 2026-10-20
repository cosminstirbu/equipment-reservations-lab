FROM docker.io/library/node:24.15.0-bookworm-slim@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d AS build
WORKDIR /app
COPY src/Web/package.json src/Web/package-lock.json ./
RUN npm ci
COPY src/Web/ ./
RUN node -e 'const fs=require("node:fs"); const {publicConfiguration}=require("./auth-config.cjs"); fs.writeFileSync("auth-config.json", JSON.stringify(publicConfiguration({NODE_ENV:"production",Identity__Authority:"https://identity.equipment.test/realms/equipment",Identity__Realm:"equipment",Identity__ClientId:"equipment-web"})));' \
    && npm run build -- --optimization --output-hashing=all

FROM docker.io/library/nginx:1.28.0-alpine@sha256:30f1c0d78e0ad60901648be663a710bdadf19e4c10ac6782c235200619158284
COPY deploy/images/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/dist/browser/ /usr/share/nginx/html/
USER 101:101
EXPOSE 8080
ENTRYPOINT ["nginx", "-g", "daemon off;"]

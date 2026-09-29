# TownRate API

Backend for **TownRate**, a local business review platform. Business owners publish profiles with photos, people search for businesses by keyword, category or location, and leave ratings and reviews that owners can respond to.

Built with **Node.js, Express 5, MongoDB (Mongoose)** and **Firebase** (Auth + Storage).

## Features

- **JWT auth** with roles: `user`, `owner`, `admin`
- **Firebase Auth**: exchange a Firebase ID token (Google, email link, etc.) for an app JWT
- **Business profiles**: full CRUD, owner-only edits, GeoJSON location
- **Photos in Firebase Storage**, uploaded with multer. Without Firebase credentials they fall back to local disk, so the app still runs.
- **Search** by keyword across name, description, tags, city and category name, with category, city and rating filters
- **"Near me"** geo search (`$geoNear` on a 2dsphere index), sorted by distance with `distanceKm`
- **Reviews**: one per user per business, owners can't review their own; the average rating and count are recalculated on every change
- **Owner response to reviews**
- **Categories** with business counts
- **Validation** on every input (express-validator), consistent JSON errors
- **Docs**: Swagger UI at `/api-docs` and a Postman collection
- **Tests**: 39 tests (unit and end-to-end against a real MongoDB)

## Quick start

Requirements: Node.js 18+ and MongoDB (local or Atlas).

```bash
git clone <your-repo-url> townrate-api
cd townrate-api
npm install
cp .env.example .env        # then edit MONGO_URI and JWT_SECRET
npm run seed -- --fresh     # categories + demo users, businesses and reviews
npm run dev                 # http://localhost:5000
```

Open **http://localhost:5000/api-docs** for interactive docs.

Seeded accounts (password `password123`):

| Email | Role |
|---|---|
| admin@townrate.dev | admin |
| owner@townrate.dev | owner |
| owner2@townrate.dev | owner |
| alice@townrate.dev | user |
| bob@townrate.dev | user |

### Scripts

| Command | Description |
|---|---|
| `npm start` | Start the server |
| `npm run dev` | Start with auto-reload (`node --watch`) |
| `npm run seed` | Add categories and demo data if missing (`-- --fresh` wipes the DB first, `-- --categories-only` skips demo accounts) |
| `npm test` | Run all tests (API tests need MongoDB, see [Testing](#testing)) |

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | no | `5000` | HTTP port |
| `NODE_ENV` | no | `development` | `production` requires `JWT_SECRET` |
| `BASE_URL` | no | `http://localhost:PORT` | Public URL, used for locally stored photo links |
| `MONGO_URI` | yes | `mongodb://127.0.0.1:27017/townrate` | MongoDB connection string |
| `JWT_SECRET` | yes in prod | dev fallback | Secret for signing tokens |
| `JWT_EXPIRES_IN` | no | `7d` | Token lifetime |
| `FIREBASE_PROJECT_ID` | no | | Service account project id |
| `FIREBASE_CLIENT_EMAIL` | no | | Service account client email |
| `FIREBASE_PRIVATE_KEY` | no | | Service account private key (`\n` escapes are fine) |
| `GOOGLE_APPLICATION_CREDENTIALS` | no | | Alternative: path to the service account JSON |
| `FIREBASE_STORAGE_BUCKET` | for Storage | | e.g. `your-project.appspot.com` |
| `MAX_FILE_SIZE_MB` | no | `5` | Max size per photo |
| `MAX_PHOTOS_PER_BUSINESS` | no | `10` | Max photos per business |

### Setting up Firebase

1. Create a project in the [Firebase console](https://console.firebase.google.com/).
2. **Storage**: enable Cloud Storage and copy the bucket name into `FIREBASE_STORAGE_BUCKET`.
3. **Auth**: enable the sign-in providers you want (e.g. Google) under Authentication.
4. **Project settings → Service accounts → Generate new private key**. Copy `project_id`, `client_email` and `private_key` into the `.env` (or set `GOOGLE_APPLICATION_CREDENTIALS` to the file path; the file is git-ignored).

`GET /api/health` shows whether Firebase Auth and Storage are active.

## API reference

Base URL: `http://localhost:5000/api`. Send the token as `Authorization: Bearer <token>`.

All responses use the shape `{ "success": true, "data": ..., "pagination"?: {...} }`. Errors look like `{ "success": false, "message": "...", "errors"?: [{ "field", "message" }] }`.

### Auth

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/auth/register` | public | `{ name, email, password, role? }`. `role` is `user` (default) or `owner` |
| POST | `/auth/login` | public | `{ email, password }` returns `{ token, user }` |
| POST | `/auth/firebase` | public | `{ idToken, role? }` Firebase ID token for an app JWT. Links by email or creates the account |
| GET | `/auth/me` | any user | Current user |

### Businesses

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/businesses` | public | List. Filters: `category` (id/slug/name), `city`, `minRating`, `owner` (id or `me`), `sort` (`newest`, `oldest`, `rating`, `reviews`, `name`), `page`, `limit` |
| GET | `/businesses/search?keyword=cafe` | public | Keyword search, also accepts `category`, `city`, `minRating`, `sort`. Sorted by rating by default |
| GET | `/businesses/near?lat=&lng=&radius=5` | public | Nearby businesses within `radius` km (default 5, max 100), nearest first, with `distanceKm`. Also `category`, `minRating`, `limit` |
| GET | `/businesses/:id` | public | One business |
| POST | `/businesses` | owner, admin | Create. JSON or `multipart/form-data` with up to 5 `photos` |
| PUT | `/businesses/:id` | its owner, admin | Partial update. Multipart `photos` are appended |
| DELETE | `/businesses/:id` | its owner, admin | Deletes the business, its reviews and photos |
| POST | `/businesses/:id/photos` | its owner, admin | Upload photos (`photos` field) |
| DELETE | `/businesses/:id/photos/:photoId` | its owner, admin | Delete a photo |

Create body (JSON):

```json
{
  "name": "Brew Lab",
  "description": "Third-wave coffee and waffles",
  "category": "cafe",
  "tags": ["coffee", "wifi"],
  "address": { "street": "7 Waterfield Road", "city": "Mumbai", "state": "Maharashtra", "zip": "400050" },
  "latitude": 19.0607,
  "longitude": 72.8362,
  "phone": "+91 98200 22222",
  "website": "https://example.com"
}
```

In multipart requests use `address[city]` style keys and comma-separated `tags`.

### Reviews

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/reviews` | any user | `{ business, rating (1-5), title?, comment? }`. One per user per business, not on your own business |
| GET | `/reviews/business/:id` | public | Reviews for a business with `summary` (average, count, 1-5 star breakdown). `sort`: `newest`, `oldest`, `highest`, `lowest` |
| GET | `/reviews/me` | any user | Your reviews |
| PUT | `/reviews/:id` | author | Edit rating, title or comment |
| DELETE | `/reviews/:id` | author, admin | Delete |
| POST / PUT | `/reviews/:id/response` | business owner, admin | `{ text }`. Add or replace the owner response |
| DELETE | `/reviews/:id/response` | business owner, admin | Remove the response |

### Categories

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/categories` | public | All categories with `businessCount` |
| POST | `/categories` | admin | `{ name, description?, icon? }` (slug generated) |
| PUT | `/categories/:id` | admin | Update |
| DELETE | `/categories/:id` | admin | Delete. Refused (409) while businesses use it |

### Example user flow

```bash
# 1. Search local cafes
curl "http://localhost:5000/api/businesses/search?keyword=cafe"

# 2. Log in and leave a review
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@townrate.dev","password":"password123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.token')

curl -X POST http://localhost:5000/api/reviews \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"business":"<businessId>","rating":5,"comment":"Great coffee"}'

# 3. View all reviews for the business
curl "http://localhost:5000/api/reviews/business/<businessId>"
```

### Status codes

| Code | Meaning |
|---|---|
| 200 / 201 | OK / created |
| 400 | Bad request (unknown category, bad file, malformed JSON) |
| 401 | Missing, invalid or expired token |
| 403 | Wrong role or not the owner |
| 404 | Not found |
| 409 | Conflict (duplicate email, second review, category in use) |
| 422 | Validation failed, see `errors` |
| 503 | Firebase not configured (for `/auth/firebase`), or DB down (health) |

## API documentation

- **Swagger UI**: `/api-docs` (raw spec at `/api-docs.json`)
- **Postman**: import `postman/TownRate.postman_collection.json`. Run `npm run seed -- --fresh` first. Logins save tokens and creates save ids into collection variables, so the folders run top to bottom (all 41 requests pass in the Collection Runner). File fields use `postman/sample-photo.png`.

  ```bash
  npx newman run postman/TownRate.postman_collection.json --working-dir postman
  ```

## Project structure

```
src/
  app.js                 Express app (middleware, docs, routes, error handling)
  server.js              Connects to MongoDB and starts listening
  config/                env, database, Firebase Admin setup
  models/                User, Business, Review, Category
  controllers/           Request handlers
  routes/                Route definitions per resource
  middleware/
    auth.js              JWT verification (protect / optionalAuth) and role checks
    upload.js            multer: images only, size and count limits
    validate.js          Runs express-validator chains, returns 422
    errorHandler.js      Maps Mongoose, multer and JWT errors to JSON responses
  validators/            Validation rules for every endpoint
  services/storage.js    Firebase Storage upload/delete with local-disk fallback
  docs/openapi.js        OpenAPI 3 spec
  utils/                 ApiError, pagination/search helpers
scripts/seed.js          Demo data
tests/                   node:test + supertest
postman/                 Postman collection
```

## Design notes

- **Cached ratings.** `averageRating` and `reviewCount` live on the business so lists can sort and filter by rating without a join. They're recomputed with an aggregation whenever a review is created, edited or deleted, and can't be set through the API.
- **One review per user per business** is enforced by a unique compound index, not just a pre-check, so concurrent requests can't create duplicates.
- **Search** uses case-insensitive regexes rather than a `$text` index so partial words match (`caf` finds "Cafe"). User input is regex-escaped. Searching a category name (e.g. "cafe") also returns businesses in that category.
- **Geo search** stores `[longitude, latitude]` GeoJSON points with a 2dsphere index. Businesses without coordinates are still valid; they just don't appear in `/near`.
- **Uploads** stay in memory and go to storage only after the business passes validation. If saving then fails, the uploaded files are deleted.
- **Firebase is optional.** Without credentials, photos go to `./uploads` (served at `/uploads`) and `/auth/firebase` returns 503. Local disk isn't persistent on most hosts, so configure Firebase in production.
- **Roles.** Self-registration can only choose `user` or `owner`. Admins are created in the database or by the seed script.

## Testing

```bash
# Uses mongodb://127.0.0.1:27017/townrate_test by default (dropped before and after)
npm test

# Or point at another instance
TEST_MONGO_URI=mongodb://127.0.0.1:27018/townrate_test npm test
```

The end-to-end suite covers auth, role and ownership checks, validation, multipart photo upload and deletion, search, geo search, rating recalculation, owner responses, categories and error handling. If MongoDB is unreachable the API tests are skipped and the unit tests still run.

## Deployment (Render)

1. Create a MongoDB Atlas cluster and copy its connection string.
2. On Render: **New → Blueprint**, pick this repo (uses `render.yaml`).
3. Set `MONGO_URI`, `BASE_URL` (your Render URL) and the Firebase variables. `JWT_SECRET` is generated automatically.
4. After the first deploy, seed categories from your machine: `MONGO_URI="<atlas uri>" npm run seed -- --categories-only`. (Without the flag the demo accounts, including an admin with a known password, are created too.)

For Heroku: `heroku create`, set the same config vars, `git push heroku main` (the `start` script is used).

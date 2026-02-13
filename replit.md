# Message Drop

## Overview
A web application where users can drop anonymous or named messages for others to see. Messages appear as colorful cards on a shared board.

## Tech Stack
- **Runtime**: Node.js 20
- **Backend**: Express.js
- **Database**: PostgreSQL (Replit built-in)
- **Frontend**: Vanilla HTML/CSS/JS (served as static files)

## Project Structure
```
├── server.js          # Express server with API routes
├── public/
│   ├── index.html     # Main HTML page
│   ├── style.css      # Styles
│   └── app.js         # Frontend JavaScript
├── package.json       # Node.js dependencies
└── .gitignore
```

## API Endpoints
- `GET /api/messages` - Fetch latest 100 messages
- `POST /api/messages` - Create a new message (body: author, content, color)
- `DELETE /api/messages/:id` - Delete a message

## Database
- Uses PostgreSQL via `DATABASE_URL` environment variable
- Single `messages` table with: id, author, content, color, created_at

## Running
- The app runs on port 5000 via `node server.js`

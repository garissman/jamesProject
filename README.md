# FastAPI + React Project

A full-stack web application using FastAPI for the backend and React (with Vite) for the frontend.

## Project Structure

```
jamesProject/
├── main.py                 # FastAPI backend
├── requirements.txt        # Python dependencies
└── frontend/              # React frontend
    ├── src/
    │   ├── App.jsx
    │   └── App.css
    └── package.json
```

## Setup Instructions

### Backend (FastAPI)

1. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Run the backend:
```bash
python main.py
```

The API will be available at `http://localhost:8000`

### Frontend (React)

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

The React app will be available at `http://localhost:5173`

## API Endpoints

- `GET /` - Welcome message
- `GET /api/items` - Get all items
- `POST /api/items` - Create a new item

## Features

- FastAPI backend with CORS enabled
- React frontend with Vite
- REST API integration
- Sample CRUD operations
- Modern UI with hover effects
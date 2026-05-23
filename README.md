# StudyBuddy-AI

A powerful and modern AI-driven study platform combining a feature-rich React TypeScript webapp with a scalable Python backend on Firebase. StudyBuddy-AI delivers dynamic content processing, question generation, and personalized learning support for students.

---

## 🌟 Features

- **AI-Powered Content Processing:** Automatically chunks, indexes, and embeds study materials for quick information retrieval.
- **AI-Generated Assessments:** Generates daily practice problems and lecture-based MCQs for continuous learning.
- **Voice Coaching:** Offers voice guidance and coaching features using advanced models.
- **Syllabus and Lecture Management:** Upload, parse, and manage syllabi, lectures, and materials.
- **Doubt Solving:** Instant AI-supported solution for learning queries.
- **Seamless Authentication:** Secure user sign-in and context-aware routing.
- **Mobile-First UI:** Built with Tailwind CSS and Radix UI components for beautiful, accessible design.
- **Scalable Serverless Functions:** Python APIs deployed with Firebase Functions for high reliability.

---

## 🧩 Repository Structure

```text
.
├── functions/     # Python backend (Firebase Functions APIs)
├── webapp/        # Main React + TypeScript frontend
├── webapp_public/ # Public assets for static deployment
├── firebase.json  # Firebase project configuration
├── firestore.rules / indexes # Security & indexing for Firestore
```

### Key Backend Modules (`functions/`)

- `main.py`: Entry point wiring all backend functionalities.
- `chunk_study_material.py`: Splits materials for vector search/embedding.
- `embed_study_material_chunk.py`: Embeds content using Google GenAI.
- `solve_doubt.py`: Answers student queries using AI.
- `generate_dpp.py`: Creates daily practice papers.
- `generate_lecture_mcq.py`: Auto-generates MCQs for evaluation.
- `parse_syllabus.py`, `upload_lecture_material.py`, `delete_study_material.py`, etc.: Utility and CRUD endpoints.

All Python functions are exported for Firebase deployment and heavily leverage packages like `firebase_functions`, `google-genai`, and `google-cloud-firestore`.

### Key Frontend Modules (`webapp/`)

- Built with React 19+ and TypeScript, using Vite for speedy builds.
- Extensive use of TanStack Router, React Query, and Radix UI for best practices.
- Entry point: `src/main.tsx`
- Routing: `src/router.tsx`
- Authentication with Firebase

---

## 🚀 Getting Started

### Prerequisites

- Node.js + npm (for the frontend)
- Python 3.10+ (for backend functions)
- Firebase CLI

### 1. Clone the Repository

```sh
git clone https://github.com/himanshi-0070/StudyBuddy-AI.git
cd StudyBuddy-AI
```

### 2. Set Up and Run Web Frontend

```sh
cd webapp
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) (default Vite port).

### 3. Set Up and Run Backend Functions Locally

```sh
cd functions
python -m venv venv
source venv/bin/activate  # (venv\Scripts\activate on Windows)
pip install -r requirements.txt
# Deploy/test with Firebase CLI as needed
```

### 4. Deploy to Firebase

Adjust configuration in `firebase.json`, `firestore.rules`, etc.  
Deploy via:

```sh
firebase deploy --only functions,hosting
```

---

## ⚙️ Configuration

- Environment variables for the backend (Google GenAI API keys, etc.) can be managed in `.env` files (see usage in Python).
- Firestore and Storage rules need to be set up for production use.

---

## 📝 Tech Stack

- **Frontend:** React (19+), TypeScript, Vite, Tailwind CSS, Radix UI, TanStack Query & Router
- **Backend:** Python, Firebase Functions, Google GenAI, Google Cloud Firestore
- **Other:** Firebase Hosting, Security Rules, Modern CI/CD ready

---

## 🤖 AI Models & Usage

- Integrates Google GenAI for content embedding and query solutions.
- Modular Python backend makes it easy to extend with more endpoints or models.

---

---

## 🙋‍♂️ Contributing

Pull requests and issues are welcome. Please open a discussion for major feature requests.

---

## 📞 Acknowledgments

- [TanStack](https://tanstack.com/) for best-in-class React libraries
- [Google GenAI](https://ai.google.dev/)
- [Firebase](https://firebase.google.com/)

---

> **StudyBuddy-AI** – Supercharge your study journey with smart, scalable, and beautiful AI-driven tools!


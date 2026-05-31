# 🎬 IMDb RAG AI Chatbot (BYOK Edition)

A highly optimized, production-ready Retrieval-Augmented Generation (RAG) chatbot designed to scrape and query custom IMDb lists (e.g., world-class singers, movies, etc.) using a localized architecture. Built with **Next.js (App Router)**, **Tailwind CSS**, and **Vercel AI SDK**.

This application implements the **Bring Your Own Key (BYOK)** architecture to keep production usage 100% free and secure for hosts, shifting the API cost securely to the client's local environment.

---

## ✨ Features

- **🌐 Live Web Scraper (`scraper.mjs`)**: Bypasses bot detection using custom headers and retrieves unstructured data from designated IMDb lists.
- **⚡ Local Search Index (BM25-lite)**: Fast, free keyword-based matching. It parses the scraped data, splits it into semantic chunks, and creates a local search index—meaning **$0 RAG database costs**!
- **🔑 Bring Your Own Key (BYOK)**: User's OpenAI API Key is securely stored on their own browser (`localStorage`) and never hits a database.
- **🎨 Premium User Interface**: A modern dark-themed interface with smooth micro-animations, glassmorphism, responsive elements, and optimized avatar scaling.
- **🤖 Serverless Processing**: Runs AI generation securely using `gpt-4o-mini` over serverless functions.

---

## 🛠️ Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS
- **AI Integration**: Vercel AI SDK (`ai` and `@ai-sdk/openai`)
- **Scraper**: Cheerio
- **Database/Storage**: Static JSON File (`rag-data.json`)
- **Deployment**: Vercel / Netlify

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- An OpenAI API Key (input directly into the live website)

### Installation & Scraper Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yashraj4/imdb-rag-chatbot.git
   cd imdb-rag-chatbot
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run the IMDb Scraper:**
   Extract and compile the latest list data into your local vector-less index:
   ```bash
   node scraper.mjs
   ```

4. **Start the local development server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser!

---

## 📦 Production Deployment

Because this app utilizes the **BYOK model**, deploying is completely plug-and-play:

1. **Push to GitHub** (if not already done).
2. Go to **[Vercel](https://vercel.com/)** or **[Netlify](https://netlify.com/)**.
3. Import the repository.
4. Hit **Deploy**! No environment variables (`OPENAI_API_KEY`) are required on the server side because users input their own key in the UI.

---

## 🔒 Security

We value privacy. The OpenAI API Key provided by users in the UI is stored purely in the browser's `localStorage` and sent over an encrypted HTTPS connection directly to the serverless function endpoint to stream responses, ensuring complete privacy and security.

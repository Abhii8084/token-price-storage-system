# Token Price Storage System

A modern **Next.js + TypeScript + Tailwind** web application for storing and analyzing token price data with real-time updates and historical insights.  
Built with a **scalable API architecture** and optimized for performance, caching, and data visualization.

---

## 🚀 **Features**
- **Real-time Token Data** – Fetch and store live token prices.
- **Historical Data Storage** – Keep track of price history with MongoDB.
- **API Routes** – Server-side API endpoints using Next.js (e.g., `/api/submit-token`, `/api/schedule-history`).
- **Redis Caching** – Faster responses and reduced database load.
- **Background Jobs** – Queue processing with Bull for batch analytics.
- **Secure & Configurable** – API keys, JWT authentication (optional), and CORS support.
- **Fully Responsive UI** – TailwindCSS for clean and adaptive design.

---

## 🛠 **Tech Stack**
- **Frontend:** [Next.js 14](https://nextjs.org/) (App Router), TypeScript, Tailwind CSS
- **Backend:** Next.js API Routes, Node.js
- **Database:** MongoDB
- **Caching & Queues:** Redis, Bull
- **APIs:** [Alchemy](https://www.alchemy.com/) for blockchain data

---

## ⚙️ **Installation & Setup**
### **1. Clone the Repository**
```bash
git clone https://github.com/YOUR_USERNAME/token-price-storage-system.git
cd token-price-storage-system
2. Install Dependencies
bash
Copy
Edit
npm install
# or
pnpm install
3. Configure Environment
Create a .env file in the root directory:

env
Copy
Edit
NODE_ENV=development
PORT=3001
MONGODB_URL=mongodb://localhost:27017/token_price_storage
REDIS_URL=redis://localhost:6379
ALCHEMY_API_KEY=your-alchemy-api-key
4. Run the Project
bash
Copy
Edit
npm run dev
Your app will start on http://localhost:3000.

📁 Project Structure
python
Copy
Edit
app/
  layout.tsx          # Main layout
  page.tsx            # Homepage
  globals.css         # Global styles
  api/
    submit-token/     # API route to store token data
    schedule-history/ # API route for historical scheduling
components.json       # Tailwind components config
tailwind.config.ts    # TailwindCSS configuration
🧪 Testing
Run tests with:

bash
Copy
Edit
npm test
📸 Screenshots
Add screenshots of your UI here (/public/screenshots).

📜 License
This project is licensed under the MIT License.

🤝 Contributing
Pull requests are welcome! Feel free to open issues or suggest new features.

👨‍💻 Author
Abhishek Raj
Portfolio | GitHub | LinkedIn

yaml
Copy
Edit

---

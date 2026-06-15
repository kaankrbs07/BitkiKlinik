# BitkiKlinik 🌿📱

An advanced, AI-powered agricultural health diagnostic and disease forecasting system. The platform consists of a **React Native (Expo)** mobile application, a **.NET 9 Web API** backend, and a **Python (FastAPI)** machine learning service, all orchestrated via **Docker**.

---

## 🏗️ Architecture Overview

The application utilizes a distributed microservices-like architecture:
1. **Mobile App (React Native & Expo):** Serves as the user interface, allowing users to take leaf photos, view analysis results, read crop health notifications, and access historical logs.
2. **Backend API (.NET 8):** Manages user authentication, audit logging, agricultural risk assessments, and handles task scheduling using **Hangfire**.
3. **Machine Learning API (Python & FastAPI):** Performs automated image classification to detect plant diseases using deep learning models.
4. **Message Broker (RabbitMQ):** Facilitates asynchronous communication between services.
5. **Database (PostgreSQL / MSSQL):** Stores application data, user profiles, and audit records.

---

## 🚀 Key Features

* **AI-Powered Disease Detection:** Take photos of plant leaves using the in-app camera or upload from the gallery to diagnose diseases instantly.
* **Agricultural Disease Forecasting:** Arka planda (Background Service) çalışan ve hava durumu/bölgesel verilere dayanarak potansiyel tarımsal risk seviyelerini hesaplayan algoritma.
* **Notification System:** In-app local notifications triggered when critical disease risks are forecasted for the user's location.
* **Audit Logging:** Comprehensive tracking of administrator actions and system operations.
* **Secure Authentication:** JWT-based secure authentication flow with built-in password reset functionality.

---

## 🛠️ Tech Stack

### Frontend (Mobile App)
* **Framework:** Expo (React Native)
* **Navigation:** Expo Router (File-based routing)
* **State Management:** Zustand
* **Styling:** React Native Stylesheets (Vanilla CSS-in-JS style)

### Backend Services
* **Core API:** .NET 9 Web API
* **Task Scheduler:** Hangfire
* **Queue Broker:** RabbitMQ
* **ML API:** Python (FastAPI, PyTorch/TensorFlow)

### Infrastructure & Deployment
* **Containerization:** Docker & Docker Compose

---

## 📦 Getting Started

### Prerequisites
Make sure you have the following installed on your machine:
* [Docker Desktop](https://www.docker.com/products/docker-desktop/)
* [Node.js](https://nodejs.org/) (LTS recommended)
* Expo Go app on your physical iOS/Android device (optional, for physical testing)

### Installation & Run Steps

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd BitkiKlinik
   ```

2. **Configure Environment Variables:**
   Review and adjust the configuration files inside the API and root directories (`.env`).

3. **Start the System:**
   We provide a control panel script to easily boot up the entire stack.
   * Double-click `start_all.bat` on Windows (or run it via Command Prompt).
   * Select **Option 1 (Docker Modu)**.
   
   This script will:
   * Build and run the database, RabbitMQ, ML API, and .NET API in Docker containers.
   * Start the Expo Metro bundler for the mobile application in a new command window.

### 🌐 Default Access Points
* **.NET Web API:** `http://localhost:5000`
* **ML API (FastAPI):** `http://localhost:8000/health`
* **RabbitMQ Dashboard:** `http://localhost:15672` (Default User: `guest` / Pass: `guest`)

---

## 📱 Running the Mobile App Locally

If you need to start the mobile client manually:
```bash
cd BitkiKlinik
npm install
npm start
```
Scan the QR code displayed in the terminal using the Expo Go app (Android) or the default Camera app (iOS) to test the app on a physical device.

---

## 🤝 Contributing
Contributions, issues, and feature requests are welcome. Feel free to open issues or pull requests to improve the system.

## 📝 License
This project is private and proprietary. All rights reserved.

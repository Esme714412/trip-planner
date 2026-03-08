# 旅行計畫 App — 完整部署指南
> 適合對象：完全新手，電腦沒裝任何開發工具

---

## 目錄
1. [安裝必要工具](#1-安裝必要工具)
2. [建立 GitHub 帳號與儲存庫](#2-建立-github-帳號與儲存庫)
3. [建立 React 專案並加入程式碼](#3-建立-react-專案並加入程式碼)
4. [建立 Firebase 專案](#4-建立-firebase-專案)
5. [設定 Firebase Authentication（Google 登入）](#5-設定-firebase-authentication)
6. [設定 Firestore 資料庫](#6-設定-firestore-資料庫)
7. [設定環境變數 .env](#7-設定環境變數-env)
8. [本機測試](#8-本機測試)
9. [推送到 GitHub](#9-推送到-github)
10. [部署到 Netlify](#10-部署到-netlify)
11. [設定 Netlify 環境變數](#11-設定-netlify-環境變數)
12. [常見問題排解](#12-常見問題排解)

---

## 1. 安裝必要工具

### 1-1. 安裝 Node.js
1. 前往 https://nodejs.org
2. 點選左邊的 **LTS** 版本（綠色按鈕）下載
3. 執行下載的安裝檔，一路點「Next」即可
4. 安裝完畢後，開啟**終端機（Terminal）**：
   - Windows：按 `Win+R`，輸入 `cmd`，按 Enter
   - Mac：按 `Command+空格`，輸入 `Terminal`，按 Enter
5. 輸入以下指令確認安裝成功（應顯示版本號，如 `v20.x.x`）：
   ```
   node -v
   npm -v
   ```

### 1-2. 安裝 VS Code（程式碼編輯器）
1. 前往 https://code.visualstudio.com
2. 點選大藍色下載按鈕
3. 執行安裝檔，一路點「Next」即可

### 1-3. 安裝 Git
1. 前往 https://git-scm.com/downloads
2. 下載並安裝（全部預設選項即可）
3. 安裝完後在終端機輸入確認：
   ```
   git --version
   ```

---

## 2. 建立 GitHub 帳號與儲存庫

### 2-1. 註冊 GitHub
1. 前往 https://github.com
2. 點選右上角 **Sign up**，填入 Email、密碼、使用者名稱
3. 完成 Email 驗證

### 2-2. 建立新儲存庫（Repository）
1. 登入 GitHub 後，點右上角「**+**」→ **New repository**
2. 填入：
   - **Repository name**：`trip-planner`（或任意名稱）
   - 選 **Private**（私人，建議）
   - **不要勾選** Initialize this repository
3. 點 **Create repository**
4. 頁面會顯示一個網址，例如：
   `https://github.com/你的帳號/trip-planner.git`
   **先複製備用**

---

## 3. 建立 React 專案並加入程式碼

### 3-1. 取得本份程式碼包
將 Claude 提供的完整資料夾解壓縮，你會看到以下結構：
```
trip-planner/
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── netlify.toml
├── .gitignore
├── .env.example
└── src/
    ├── main.jsx
    ├── index.css
    ├── App.jsx
    ├── firebase/
    │   └── config.js
    └── components/
        ├── AuthScreen.jsx
        ├── TripSelector.jsx
        ├── TripApp.jsx
        ├── ExpenseFormModal.jsx
        └── ConfirmModal.jsx
```

### 3-2. 用 VS Code 開啟專案
1. 開啟 VS Code
2. 點選 **File → Open Folder**，選取 `trip-planner` 資料夾
3. 點選上方選單 **Terminal → New Terminal**（開啟內建終端機）

### 3-3. 安裝相依套件
在終端機輸入：
```bash
npm install
```
等待完成（約 1~2 分鐘），完成後會出現 `node_modules` 資料夾。

---

## 4. 建立 Firebase 專案

### 4-1. 前往 Firebase Console
1. 前往 https://console.firebase.google.com
2. 使用 Google 帳號登入

### 4-2. 建立新專案
1. 點選 **「新增專案」**
2. 輸入專案名稱（如：`trip-planner`）
3. **停用 Google Analytics**（點開關 → 繼續）
4. 點 **「建立專案」**，等待約 30 秒
5. 出現「您的新專案已準備就緒」→ 點 **「繼續」**

### 4-3. 新增 Web 應用程式
1. 在專案首頁，點選 **`</>`**（Web）圖示
2. 輸入應用程式暱稱：`trip-planner-web`
3. **不需要勾選** Firebase Hosting
4. 點 **「註冊應用程式」**
5. 你會看到一段 `firebaseConfig` 的程式碼，像這樣：
   ```javascript
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "trip-planner-xxxxx.firebaseapp.com",
     projectId: "trip-planner-xxxxx",
     storageBucket: "trip-planner-xxxxx.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abc123"
   };
   ```
6. **先把這些值複製起來備用！**
7. 點 **「繼續前往主控台」**

---

## 5. 設定 Firebase Authentication

### 5-1. 啟用 Authentication
1. 在左側選單點 **「建構」→「Authentication」**
2. 點 **「開始使用」**

### 5-2. 啟用 Google 登入
1. 點選 **「Sign-in method」** 分頁
2. 在「登入提供者」清單中，點選 **「Google」**
3. 右上角點開關 **啟用**
4. 填入「專案支援電子郵件」（選你自己的 Gmail）
5. 點 **「儲存」**

### 5-3. 新增授權網域（部署後才需要）
> 先跳過，部署到 Netlify 後再回來設定

---

## 6. 設定 Firestore 資料庫

### 6-1. 建立 Firestore
1. 在左側選單點 **「建構」→「Firestore Database」**
2. 點 **「建立資料庫」**
3. 選 **「以正式環境模式啟動」**
4. 選擇資料中心位置：選 **`asia-east1`**（台灣最近）
5. 點 **「啟用」**，等待約 30 秒

### 6-2. 設定安全性規則
1. 點選 **「規則」** 分頁
2. 將原有規則**全部刪除**，貼上以下內容：
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```
3. 點 **「發布」**

> **說明**：這條規則確保每個使用者只能讀寫自己的資料，其他人無法存取。

---

## 7. 設定環境變數 .env

### 7-1. 複製範本
在 VS Code 的終端機輸入：
```bash
cp .env.example .env
```

### 7-2. 填入 Firebase 設定值
用 VS Code 開啟 `.env` 檔案，把剛才複製的 `firebaseConfig` 值填入對應位置：

```
VITE_FIREBASE_API_KEY=你的 apiKey 值
VITE_FIREBASE_AUTH_DOMAIN=你的 authDomain 值
VITE_FIREBASE_PROJECT_ID=你的 projectId 值
VITE_FIREBASE_STORAGE_BUCKET=你的 storageBucket 值
VITE_FIREBASE_MESSAGING_SENDER_ID=你的 messagingSenderId 值
VITE_FIREBASE_APP_ID=你的 appId 值
```

> ⚠️ **注意**：`.env` 檔案已在 `.gitignore` 中，不會被上傳到 GitHub，這是正確的安全做法。

---

## 8. 本機測試

在終端機輸入：
```bash
npm run dev
```

終端機會顯示類似：
```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
```

打開瀏覽器前往 `http://localhost:5173`，應該看到登入頁面。
點選「使用 Google 帳號登入」測試是否能正常登入！

> **停止伺服器**：在終端機按 `Ctrl+C`

---

## 9. 推送到 GitHub

### 9-1. 設定 Git 使用者資訊
在終端機輸入（替換成你的資訊）：
```bash
git config --global user.name "你的名字"
git config --global user.email "你的Email"
```

### 9-2. 初始化並推送
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/你的帳號/trip-planner.git
git push -u origin main
```

> 推送時可能會要求輸入 GitHub 帳號密碼，或要求授權。
> 若出現密碼錯誤，請前往 GitHub → Settings → Developer Settings → Personal Access Tokens 產生 Token 作為密碼使用。

---

## 10. 部署到 Netlify

### 10-1. 建立 Netlify 帳號
1. 前往 https://www.netlify.com
2. 點選 **「Sign up」→ 選「GitHub」** 登入（最方便）

### 10-2. 建立新網站
1. 登入後，點 **「Add new site」→「Import an existing project」**
2. 點 **「GitHub」**
3. 選擇你的 `trip-planner` 儲存庫
4. 設定如下：
   - **Branch to deploy**：`main`
   - **Build command**：`npm run build`（應自動填入）
   - **Publish directory**：`dist`（應自動填入）
5. **先不要點 Deploy**，繼續下一步設定環境變數

---

## 11. 設定 Netlify 環境變數

1. 在 Netlify 部署設定頁面，往下找到 **「Environment variables」**
2. 點 **「Add environment variables」**
3. 新增以下六組（Key 和 Value 各填一個）：

| Key | Value |
|-----|-------|
| `VITE_FIREBASE_API_KEY` | 你的 apiKey |
| `VITE_FIREBASE_AUTH_DOMAIN` | 你的 authDomain |
| `VITE_FIREBASE_PROJECT_ID` | 你的 projectId |
| `VITE_FIREBASE_STORAGE_BUCKET` | 你的 storageBucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | 你的 messagingSenderId |
| `VITE_FIREBASE_APP_ID` | 你的 appId |

4. 點 **「Deploy trip-planner」**
5. 等待約 1~2 分鐘，出現 ✅ **「Published」** 即完成！
6. 點選網址（形如 `https://你的名字.netlify.app`）確認上線

---

## 設定 Firebase 授權網域（重要！）

部署完成後，回到 Firebase Console：
1. **Authentication → Sign-in method → 授權網域**
2. 點 **「新增網域」**
3. 輸入你的 Netlify 網址（如：`你的名字.netlify.app`）
4. 點 **「新增」**

> 若沒做這步，Google 登入會出現錯誤。

---

## 之後更新程式碼

每次修改程式碼後，只需要：
```bash
git add .
git commit -m "描述你做了什麼修改"
git push
```
Netlify 偵測到 GitHub 更新後，會自動重新部署！

---

## 12. 常見問題排解

### ❌ `npm install` 失敗
- 確認 Node.js 已正確安裝：`node -v`
- 嘗試清除快取：`npm cache clean --force`，再重新執行

### ❌ 本機啟動後登入頁面空白
- 確認 `.env` 檔案存在且值已填入
- 確認 Firebase Console 中 Authentication 的 Google 登入已啟用

### ❌ Google 登入彈出視窗後出現錯誤
- 確認 Firebase Authentication 中已加入 `localhost` 為授權網域（通常預設有）
- 正式部署後，確認已加入 Netlify 網址為授權網域

### ❌ Netlify 部署失敗（Build failed）
- 點選 Netlify 中的 Deploy log 查看錯誤訊息
- 最常見原因：環境變數沒有填寫完整

### ❌ `git push` 要求密碼
- 前往 GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
- 點 **Generate new token**，勾選 `repo` 權限
- 複製 Token，push 時用 Token 作為密碼

### ❌ 資料沒有同步/無法儲存
- 確認 Firestore 安全性規則已正確設定（步驟 6-2）
- 在瀏覽器開發者工具（F12）→ Console 查看錯誤訊息

# 🔐 Google Authentication Setup for GSTD

To enable n8n to interact with Google Services (Sheets, Drive, Gmail for reports):

1.  **Google Cloud Console:** Go to [console.cloud.google.com](https://console.cloud.google.com).
2.  **Create Project:** Create a new project named "GSTD Autonomy".
3.  **Enable APIs:** Enable "Google Sheets API", "Google Drive API".
4.  **Create Credentials:**
    *   Go to **APIs & Services > Credentials**.
    *   Create **OAuth 2.0 Client ID**.
    *   Type: **Web Application**.
    *   Authorized Redirect URI: `https://n8n.gstdtoken.com/rest/oauth2-credential/callback` (or your local IP based URL).
5.  **Download JSON:** Download the credentials JSON.
6.  **Upload:** Paste the content into `/home/ubuntu/autonomy/google/credentials.json`.
7.  **n8n Setup:** In n8n, create a new Credential "Google OAuth2 API" and use the Client ID and Secret from the file.

✅ **Done.** The system can now generate spreadsheets and upload reports.

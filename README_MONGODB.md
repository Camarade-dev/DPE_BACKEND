# Configuration MongoDB

## Option 1 : MongoDB Local (Recommandé pour le développement)

### Installation MongoDB sur Windows

1. **Télécharger MongoDB Community Server** :
   - Aller sur https://www.mongodb.com/try/download/community
   - Sélectionner Windows x64
   - Télécharger et installer

2. **Démarrer MongoDB** :
   ```powershell
   # MongoDB s'installe généralement comme service Windows
   # Vérifier qu'il est démarré dans les Services Windows
   # Ou démarrer manuellement :
   mongod --dbpath "C:\data\db"
   ```

3. **Créer le fichier `.env`** dans `DPE_BACKEND/` :
   ```
   MONGO_URI=mongodb://localhost:27017/dpe_db
   JWT_SECRET=votre_secret_jwt_super_securise
   COOKIE_NAME=dpe_token
   CORS_ORIGIN=http://localhost:8000
   PORT=3000
   PYTHON_API_URL=http://localhost:8001  # En production: https://greendiag-site-vercel.onrender.com
   ```

## Option 2 : MongoDB Atlas (Cloud - Gratuit)

1. **Créer un compte** sur https://www.mongodb.com/cloud/atlas

2. **Créer un cluster gratuit** (M0)

3. **Créer un utilisateur** :
   - Database Access → Add New Database User
   - Créer un nom d'utilisateur et mot de passe

4. **Autoriser l'accès réseau** :
   - Network Access → Add IP Address
   - Ajouter `0.0.0.0/0` pour autoriser tous les IPs (ou votre IP spécifique)

5. **Obtenir la chaîne de connexion** :
   - Cliquer sur "Connect" sur votre cluster
   - Choisir "Connect your application"
   - Copier la chaîne de connexion
   - Remplacer `<password>` par votre mot de passe

6. **Mettre à jour le `.env`** :
   ```
   MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/dpe_db?retryWrites=true&w=majority
   ```

## Vérification

Une fois MongoDB configuré, redémarrer le backend :
```powershell
cd DPE_BACKEND
npm start
```

Vous devriez voir :
```
✅ Connecté à MongoDB
✅ API en écoute sur port 3000
```

## Dépannage

**"MongoDB connection failed"** :
- Vérifier que MongoDB est démarré (local) ou que l'URL Atlas est correcte
- Vérifier que le fichier `.env` existe et contient `MONGO_URI`
- Vérifier les logs MongoDB pour plus de détails

**"ENOTFOUND"** :
- L'URL MongoDB Atlas est incorrecte ou le cluster n'existe plus
- Vérifier que l'IP est autorisée dans MongoDB Atlas






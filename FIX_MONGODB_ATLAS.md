# Fix MongoDB Atlas - Whitelist IP Render

## Problème

```
MongooseServerSelectionError: Could not connect to any servers in your MongoDB Atlas cluster. 
One common reason is that you're trying to access the database from an IP that isn't whitelisted.
```

## Solution

### Étape 1 : Accéder à MongoDB Atlas

1. Allez sur [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Connectez-vous à votre compte
3. Sélectionnez votre cluster

### Étape 2 : Whitelist l'IP de Render

1. Dans le menu de gauche, cliquez sur **"Network Access"**
2. Cliquez sur **"Add IP Address"**
3. Vous avez deux options :

#### Option A : Autoriser toutes les IPs (Recommandé pour le développement)
- Cliquez sur **"Allow Access from Anywhere"**
- Cela ajoute `0.0.0.0/0` à la whitelist
- ⚠️ **Attention** : Moins sécurisé, mais fonctionne pour tous les services cloud

#### Option B : Autoriser uniquement Render (Plus sécurisé)
- Cliquez sur **"Add Current IP Address"** (si vous êtes sur Render)
- Ou ajoutez manuellement : `0.0.0.0/0` (toutes les IPs)
- Render utilise des IPs dynamiques, donc `0.0.0.0/0` est nécessaire

### Étape 3 : Vérifier la connection string

Assurez-vous que votre `MONGO_URI` dans Render contient :
- Le bon nom d'utilisateur
- Le bon mot de passe
- Le bon nom de cluster
- Le bon nom de base de données

Format : `mongodb+srv://username:password@cluster.mongodb.net/database_name?retryWrites=true&w=majority`

### Étape 4 : Redéployer

Après avoir whitelisté l'IP, redéployez votre service sur Render :
1. Allez dans votre dashboard Render
2. Cliquez sur "Manual Deploy" → "Deploy latest commit"
3. Attendez que le déploiement soit terminé

### Étape 5 : Vérifier les logs

Dans les logs Render, vous devriez voir :
```
✅ Connecté à MongoDB
```

Au lieu de :
```
❌ Erreur MongoDB: ...
```

## Dépannage

### Si ça ne fonctionne toujours pas

1. **Vérifiez que le whitelist est bien sauvegardé** dans MongoDB Atlas
2. **Attendez 1-2 minutes** après avoir ajouté l'IP (propagation)
3. **Vérifiez la connection string** dans les variables d'environnement Render
4. **Vérifiez que l'utilisateur MongoDB a les bonnes permissions**

### Test de connexion

Vous pouvez tester la connexion directement depuis Render en ajoutant temporairement :

```javascript
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ Connecté à MongoDB");
    mongoose.connection.db.admin().ping()
      .then(() => console.log("✅ Ping MongoDB réussi"))
      .catch(err => console.error("❌ Ping MongoDB échoué:", err));
  })
```

## Sécurité

Pour la production, considérez :
- Utiliser des IPs spécifiques si possible
- Activer l'authentification MongoDB
- Utiliser des credentials avec des permissions limitées
- Activer le monitoring MongoDB Atlas



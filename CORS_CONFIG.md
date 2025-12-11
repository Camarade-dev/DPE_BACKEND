# Configuration CORS pour la production

## Problème

Le backend bloque les requêtes depuis le frontend déployé à cause de la configuration CORS.

## Solution

La configuration CORS a été mise à jour pour autoriser automatiquement :
- ✅ Tous les domaines `localhost` (développement local)
- ✅ Tous les domaines `vercel.app` (Vercel)
- ✅ Tous les domaines `netlify.app` (Netlify)
- ✅ Tous les domaines `onrender.com` (Render)

## Variables d'environnement

Pour une configuration plus stricte, vous pouvez définir dans Render :

### Variables d'environnement à ajouter dans Render

```
CORS_ORIGIN=https://votre-frontend.vercel.app
FRONTEND_URL=https://votre-frontend.vercel.app
```

## Test

Pour tester si CORS fonctionne :

```bash
curl -H "Origin: https://votre-frontend.vercel.app" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: Content-Type" \
     -X OPTIONS \
     https://dpe-backend.onrender.com/api/test
```

Vous devriez recevoir une réponse `204 No Content` avec les headers CORS appropriés.

## Dépannage

Si vous avez encore des erreurs CORS :

1. Vérifiez que le backend est bien redéployé avec la nouvelle configuration
2. Vérifiez les logs du backend pour voir quelle origine est bloquée
3. Vérifiez que `credentials: true` est bien configuré côté frontend
4. Vérifiez que les cookies sont bien envoyés avec `withCredentials: true`









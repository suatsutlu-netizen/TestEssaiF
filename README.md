# Essais de Frein — PWA Ferroviaire

Application Progressive Web App (PWA) pour la traçabilité des essais de frein ferroviaires.

## 📁 Structure des fichiers

```
essais-frein/
├── index.html        ← Structure HTML & navigation
├── style.css         ← Design responsive industriel
├── app.js            ← Logique applicative (timers, DB, audio)
├── sw.js             ← Service Worker (mode hors-ligne)
├── manifest.json     ← Configuration PWA
├── icons/
│   ├── icon-192.png  ← Icône PWA 192×192
│   └── icon-512.png  ← Icône PWA 512×512
└── README.md
```

## 🚀 Déploiement sur GitHub Pages

1. Créer un nouveau dépôt GitHub
2. Uploader tous les fichiers à la racine du dépôt
3. Activer GitHub Pages : `Settings → Pages → Branch: main → / (root)`
4. Accéder à `https://<votre-username>.github.io/<nom-du-repo>/`

> ⚠️ Le Service Worker nécessite HTTPS. GitHub Pages fournit automatiquement HTTPS.

## 📱 Installation sur l'écran d'accueil

- **Android/Chrome** : Bannière d'installation automatique ou `⋮ → Ajouter à l'écran d'accueil`
- **iOS/Safari** : `Partager → Sur l'écran d'accueil`

## ✅ Fonctionnalités

| Feature | Détail |
|---|---|
| Offline-First | Service Worker avec Cache-First + stale-while-revalidate |
| Persistance | IndexedDB — données conservées entre sessions |
| WakeLock | Empêche la mise en veille pendant les essais |
| Web Audio | 3 bips montants (440/660/880Hz) × 3 cycles |
| Horodatages | TS1 (Début) · TS2 (Élimination) · TS3 (Étanchéité) · TS4 (Concluant) |
| Export | Fichier .doc (HTML MSWord) avec tableau des essais |

## 🔄 Parcours utilisateur

```
Accueil
  ├── [ESSAI DE FREIN] → TS1 enregistré
  │     ↓
  │   Page 1 : Alimentation Surcharge (Jaune/Noir)
  │     → Timer manuel (6 min par défaut)
  │     → Alerte bip × 3 + clignotement à expiration
  │     → [ÉLIMINATION] → TS2 → Page 2
  │     ↓
  │   Page 2 : Élimination Surcharge 5 bar (Noir/Jaune)
  │     → Timer manuel (6 min par défaut)
  │     → Alerte bip × 3 + clignotement à expiration
  │     → [ÉTANCHÉITÉ CG] → TS3 → Page 3
  │     ↓
  │   Page 3 : Contrôle Étanchéité
  │     → Chrono 1 min
  │     → [ESSAI CONCLUANT] → TS4 → Sauvegarde IndexedDB
  │     ↓
  │   Page 4 : TERMINÉ (fond vert foncé)
  │
  └── [HISTORIQUE] → Liste des essais + Export .doc
```

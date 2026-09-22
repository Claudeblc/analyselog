# BLC Family — la maison numérique de la famille Belcram

Plateforme familiale privée et **multi-écrans** (téléphone, tablette, ordinateur, TV horizontale ou verticale).
Tous les appareils de la famille communiquent entre eux en temps réel.

| Espace | Ce qu'on y fait |
|---|---|
| 🍷 **Apéro Time** | Archive des 97 éditions (année → mois), lecture page à page, annotations, Apéro Time Live, éditeur de Papa, livre imprimable |
| 🎵 BLC Music / 📺 BLC TV | Liens vers `blc-music-player.duckdns.org/app` et `blctv-player.com` |
| 🖼️ **Galerie** | Photos et vidéos triées par personne, année, événement, album ; « Notre semaine » |
| 💬 **Discussion** | Messages texte, vocaux, photos, vidéos, réactions |
| 📹 **Appels vidéo** | Appels entre tous les écrans ; l'appel continue en fenêtre flottante pendant la navigation |
| 📢 **Interphone** | Vocal court vers une ou plusieurs TV / appareils (respecte le mode silencieux) |
| ⏳ **Capsules temporelles** | Souvenir scellé jusqu'à une date, ouverture animée sur tous les écrans |

## Ce qui est en place

- **Accueil** : grandes tuiles 3D flottantes, bouton « + Déposer un message » (texte, photo, vidéo, audio),
  carrousel familial de cartes animées (aperçu vidéo muet vivant, son au survol sur ordinateur, waveform pour les vocaux),
  notifications vivantes qui apparaissent puis s'effacent.
- **Profils** : avatar, couleur d'annotation, anniversaire ; présence en ligne visible partout.
- **Apéro Time**
  - Papa = auteur (écrire, brouillon enregistré automatiquement, versions et restauration, publication immédiate ou programmée, dépublication).
  - Claude, Christophe, Célia = relecteurs : surligner, souligner, remarque sur un passage, dessin libre au stylet/doigt,
    entourer, flèche, note libre. Chaque personne a sa couleur ; **le texte original n'est jamais modifié**.
  - Annotations filtrables par personne, masquables, supprimables, « à inclure dans le livre ».
  - **Pages identiques sur tous les écrans** (mise en page virtuelle 900×1180 mise à l'échelle) : un trait dessiné sur la
    tablette tombe exactement au même endroit sur la TV.
  - **Synchronisation temps réel** : changement de page, encre en direct pendant le dessin, sélection d'un passage →
    léger zoom sur la TV, réactions ❤️ 😂 👏 🥂 qui flottent sur la TV. Bouton « 📣 Inviter » = Apéro Time Live.
  - **Aperçus** Smartphone | Tablette | TV | **WhatsApp** (simulation visuelle : bulles, gras/italique/barré WhatsApp,
    découpage optionnel en plusieurs messages, repli « Lire la suite » approximatif, nombre d'écrans de téléphone).
  - **Livre des Apéro Time** : sommaire, une édition par page, annotations choisies par Papa → Imprimer / PDF.
- **TV** : interface dédiée (grandes zones, focus visible, navigation aux flèches de la télécommande, touche Retour),
  disposition 16:9 ou **9:16** (TV verticale), **cadre familial** automatique après inactivité (photos, vidéos,
  extraits d'Apéro Time, anniversaires, messages, capsules ouvertes, horloge).
- **Connexion TV par QR code** : jeton d'appairage aléatoire, **à usage unique, valable 3 minutes**, jamais d'identifiant
  dans le QR. Le téléphone demande « Autoriser cette télévision ? ».
- **Téléphone = télécommande** (flèches, OK, retour, lecture/pause, ouvrir Apéro Time / Galerie / cadre / appel)
  et bouton « 📺 Afficher sur la TV » sur les photos, vidéos et Apéro Time.
- **Téléphone = caméra + micro de la TV** : la TV affiche un QR code pendant l'appel ; le téléphone le scanne,
  autorise caméra + micro et rejoint l'appel comme périphérique (caméra avant/arrière, couper micro/caméra).
  Le son de ce téléphone n'est pas rejoué sur sa propre TV (pas d'écho).
- **Regarder ensemble** pendant un appel : photo, vidéo (lecture/pause/position synchronisées) ou Apéro Time.
- **Notre semaine** : regroupement automatique par semaine, réordonnable, éléments retirables, diaporama, « Conserver ».

## Accueil, entraide et BLC TV

- **Accueil** conforme à la maquette : logo manuscrit néon « Belcram Family », collage de polaroïds « Notre famille »
  (photos choisies dans ⚙️ Paramètres → Personnaliser l'accueil, sinon dernières photos de la galerie, sinon paysages
  dessinés en code), heure, météo de la Guadeloupe (Open-Meteo), « Bonjour … ♡ », 7 grandes cartes illustrées
  (ApéroTime, BLC TV Player, BLC Music Player, Galerie, Appels vidéo, Notre Famille, Paramètres), raccourcis
  Calendrier / Météo / Interphone / Discussion / Aide et « Moment du jour ». Décor coucher de soleil codé en SVG,
  remplaçable par une photo de fond.
- **Notre Famille / Entraide** : métier et **pastilles de compétences** de chacun (santé, informatique, emploi, RH…),
  champ « J'ai besoin d'aide pour… » qui indique vers qui se tourner, boutons Demander / Appeler. Historique des métiers.
- **BLC TV Player** : la carte propose le choix du serveur puis redirige automatiquement. Les liens sont définis sur le
  serveur dans `.env`, jamais dans le dépôt : `TV_SERVERS="Fox|https://…;BOD TV 4K|https://…"`.

## Architecture

```
server/index.js    Node.js (http + ws) : API REST, sessions, appairage, planificateur, temps réel, signalisation WebRTC
server/store.js    Stockage JSON dans data/ (écritures atomiques) — adapté à une famille
scripts/import-aperotime.js   Import du recueil Excel (idempotent, sans doublon)
public/            Application web (modules ES, sans étape de build), installable (PWA)
deploy/            nginx + script d'installation VPS
```

- **WebSocket** : présence, notifications, annotations, pages, réactions, commandes TV, lecture synchronisée.
- **WebRTC** (maillage pair-à-pair) : audio/vidéo des appels. STUN public par défaut ; pour les appels en 4G/5G,
  configurez un serveur **TURN** (coturn) via `TURN_URL`, `TURN_USER`, `TURN_PASS`.
- Les médias sont servis uniquement aux appareils connectés (cookie de session HttpOnly).

## Lancer en local

```bash
cd blc-family
npm install
npm run import -- /chemin/ApéroTime_recueil.xlsx   # importe les 97 Apéro Time dans data/
FAMILY_PIN=1234 npm start                           # http://localhost:3100
```

- Connexion : choisir son profil + code famille (`FAMILY_PIN`).
- Simuler une TV : `http://localhost:3100/?tv=1` (ou `?tv=vertical`), puis scanner le QR avec un autre appareil connecté.
- Caméra et micro exigent HTTPS (ou `localhost`).

## Déploiement (VPS)

1. DNS : créer les enregistrements **A** vers l'IP du VPS pour
   `family.blctv-player.com`, `galerie.blctv-player.com`, `chat.blctv-player.com`, `visio.blctv-player.com`.
2. Sur le VPS, dans le dossier `blc-family` :
   ```bash
   APEROTIME_XLSX=/root/ApéroTime_recueil.xlsx CERTBOT_EMAIL=vous@exemple.fr sudo -E bash deploy/install.sh
   ```
   Le script installe Node/pm2/nginx/certbot, demande le code famille, importe les Apéro Time, configure nginx
   (WebSocket, gros fichiers) et le HTTPS.
3. Chaque sous-domaine ouvre directement son espace : `galerie.` → Galerie, `chat.` → Discussion, `visio.` → Appels.
   Avec `COOKIE_DOMAIN=.blctv-player.com`, on reste connecté d'un sous-domaine à l'autre.

Les données (textes, photos, vidéos, sessions) sont dans `data/`, **exclu du dépôt git** : les textes de la famille ne
sont jamais publiés sur GitHub. Sauvegardez ce dossier régulièrement.

## Membres par défaut

Papa (auteur, admin), Claude (admin), Christophe, Célia. Modifiables dans ⚙️ Paramètres (prénom, couleur,
anniversaire, photo, rôle, ajout d'un membre).

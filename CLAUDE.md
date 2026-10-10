# CLAUDE.md — UniFi Network

Intégration Ubiquiti UniFi pour UCG, UDM, Switches, APs et détection de présence.

Intégration externe pour [Gladys Assistant](https://gladysassistant.com), bâtie sur le template officiel `GladysAssistant/integration-template-js` (SDK `@gladysassistant/integration-sdk` ^0.14.0, `gladys_version` `>=5.1.0`). Mainteneur : Guilhem (`guim31`).

Ce fichier rassemble ce qu'une session de code doit savoir et qui ne se lit pas dans le code : choix de conception, faits vérifiés en réel, pièges déjà payés. Le compléter quand un nouveau piège est découvert.

## État au 05/10/2026

Version 1.5.2 publiée et indexée dans le store (SDK 0.9, Gladys ≥ 4.62, sans widget).

Sur la branche `feat/dashboard-widgets` (PR #2), non fusionné : **trois widgets de tableau de bord** (`network`, `presence`,
`wifi`), SDK monté en ^0.14.0 et `gladys_version` en `>=5.1.0`. Aucun test réel n'a été fait sur
ces widgets : ni instance Gladys 5.1 ni contrôleur UniFi dans la session qui les a écrits. À
vérifier par Guilhem avant Release : rendu des tuiles liées aux fonctionnalités `wan-down` /
`wan-up`, état actif des boutons `device_feature` du widget Wi-Fi, et que `getHealth()` renvoie
bien un sous-système `wan` sur la console (sinon « Internet : Inconnu »).

Le passage à `>=5.1.0` coupe les mises à jour des Gladys plus anciens (voir pièges) : la prochaine
Release est donc une **minor** au moins, et le topic du forum doit le dire.

## Choix de conception

- **Un module pur `src/widgets.js`**, testé sans réseau : les constructeurs reçoivent le
  _snapshot_ du dernier poll (`clients`, `devices`, `wlans`, `health`, `polled`), les réglages et
  une fabrique `externalIds(type, id)`. `index.js` garde le snapshot en mémoire et le remplit au
  fil de `pollAllStates()` ; le rendu d'un widget n'appelle jamais le contrôleur.
- **Une seule détection de passerelle**, `isGatewayDevice()` dans `src/devices/gateway.js`
  (`is_gateway`, types `ugw`/`udm`/`ucg`/`gateway`/`gw`, modèle `/ucg|udm|ugw|usg|uxg|gateway/`),
  partagée par le blueprint, le poll et les widgets. Avant, le blueprint ne créait `wan-up` /
  `wan-down` que pour `ugw`/`udm`/`ucg` ou un modèle « UCG » : un USG, UXG ou `is_gateway` était
  alimenté par le poll sans avoir les fonctionnalités. Pour ces appareils déjà créés, la Découverte
  proposera « Mettre à jour » (changement de structure) à la prochaine version.
- « Internet » (widget Réseau) lit le `status` du sous-système `wan` de `stat/health` : `ok` →
  OK, `warning` → Dégradé, `error` → Coupé, autre ou absent → Inconnu.
- **Snapshot** : `polled` passe à vrai dès que `getClients()` a répondu, pas en fin de poll : une
  clé API aux droits restreints qui fait échouer `stat/device` à chaque fois laisserait sinon les
  widgets Réseau et Wi-Fi sur « En attente du premier relevé » pour toujours.
- **Références de fonctionnalités** : `gladys.externalId('gateway:<mac>:wan-down')` (poll) et
  `gladys.externalIds('gateway', mac).feature('wan-down')` (blueprint et widgets) donnent la même
  chaîne `ext:<selector>:gateway:<mac>:wan-down`, MAC en minuscules. Le faux Gladys des tests
  (`test/helpers/fakeGladys.js`) reproduit cette égalité depuis le 05/10/2026 (avant, ses deux
  méthodes n'avaient pas le même préfixe).
- Le réglage `source: "devices"` liste **tous** les appareils de l'intégration (clients, SSID,
  matériel) : un choix qui n'est pas une passerelle connue (ou pas un SSID connu) retombe sur le
  premier connu, sans erreur. La valeur reçue est l'`external_id` de l'appareil.
- **Widget Présence** : la liste vient de `gladys.getDevices()` (appareils `…:client:<mac>` créés
  dans Gladys, noms Gladys), l'état de `knownPresenceStates` (événements WebSocket + poll), avec
  repli sur le `last_value` de la fonctionnalité `presence` stocké par Gladys. Un changement de
  présence appelle `requestWidgetRefresh('presence')` par `nudgeWidget()`, qui **coalesce** dans la
  fenêtre de 10 s du cœur (un nudge pendant la fenêtre est renvoyé à sa fin), sinon le deuxième
  changement en moins de 10 s serait perdu jusqu'au `ttl` de 30 s.
- **Widget Wi-Fi** : deux boutons `device_feature` sur `wifi:<id>:state` (valeurs 1 et 0), le
  chemin natif `onSetValue`, avec l'état actif gratuit du cœur. Donc **pas de `onWidgetAction`**
  ni d'`action_timeout_seconds` dans le manifeste ; le test du manifeste le verrouille.
- La console a aussi un sous-système `www` (joignabilité Internet, latence) : plus proche du sens
  « Internet » que `wan`, à envisager si `wan` se révèle toujours `ok` câble débranché.
- Aucun texte de widget ne contient de MAC ni d'IP (`test/widgets.test.js` le vérifie sur les
  textes affichés ; les `device_feature` contiennent la MAC, mais ne sont pas affichés). Le nom
  Gladys d'un client sans nom vient de `getClientDisplayName()` (« Appareil 192.168.1.5 (ee:ff) »,
  « Apple (192.168.1.5) ») : `publicName()` retire les parenthèses qui contiennent une IP ou un
  fragment de MAC, et un nom réduit à une adresse devient « Appareil » / « Device ».
- **Appareil hérité « Switch PoE » (v1.5.2)** : la v1.5.2 publiait les ports PoE dans un appareil
  `…:poe-switch:<mac>`, la v1.6.0 les a remis dans l'appareil matériel avec les **mêmes**
  `external_id` de fonctionnalités (`…:poe:<mac>:<port>:power`). Chez qui avait ajouté l'appareil
  v1.5.2, « Mettre à jour » le matériel échouait en 409. Désormais la découverte lit
  `gladys.getDevices()` (`GET /api/integration/v1/device`, présent dans le cœur v5.1.4 ; repli sur
  `gladys.devices` si l'appel échoue) : tant qu'un `…:poe-switch:<mac>` existe, il est republié
  avec la structure exacte de la v1.5.2 (`legacyPoeSwitchBlueprint`) et le matériel l'est sans
  ports. `onDeviceDeleted` de cet appareil republie la découverte : les ports reviennent sur le
  matériel. Poll et `onSetValue` ne lisent que l'`external_id` de la fonctionnalité : rien à
  changer. `test/legacyPoeSwitch.test.js` rejoue le 409 avec un faux cœur
  (`test/helpers/fakeCore.js`) qui refuse une fonctionnalité déjà détenue par un autre appareil.
- **États** : tout passe par `src/statePublisher.js` (jamais `gladys.publishState` en direct) :
  seulement les fonctionnalités des appareils créés (`gladys.devices`, que le SDK tient à jour par
  `GET /device` et les événements created / updated / deleted ; `getDevices()` de la découverte le
  rafraîchit aussi), seulement les changements. Exception : un `presence-sensor` à 1 est republié
  au plus une fois par minute, car l'action de scène « Vérifier la présence »
  (`user.check-presence`) lit `last_value_changed`, que le cœur rafraîchit à chaque état reçu, même
  identique (comme le fait `lan-manager`, qui republie 1 à chaque scan). `onSetValue` publie avec
  `force` (état optimiste). `onDeviceCreated` / `onDeviceUpdated` oublient les dernières valeurs
  de l'appareil puis relancent un poll ; reconnexion et nouvelle configuration oublient tout. Le
  poll et la présence vivent dans `src/poller.js`, testable sans réseau.
- Textes des widgets en objets `{ en, fr }` : le cœur choisit la langue, le code n'a pas besoin de
  `language`.

## SDK 0.9 → 0.14 (05/10/2026)

Vérifié par diff des deux paquets : **aucune méthode retirée ni signature changée**. La 0.14
ajoute `onWidgetGet` / `onWidgetGetImage` / `onWidgetAction` / `requestWidgetRefresh`,
`onSceneAction` / `publishSceneEvent`, `onWeatherGet` / `onWeatherGetImage` /
`requestWeatherRefresh`, `getHouses`, `wakeOnLan`, les constantes `WIDGET_*`, `WEATHER_*`,
`validateWidgetContent` / `validateWidgetImage`, et des catégories d'appareils. Les 16 tests
existants passent inchangés.

## Travailler sur ce dépôt

- Mêmes étapes que la CI, dans le même ordre : `npm ci`, `npm run format:check`, `npm run lint`,
  `npm test` (`node --test`). Prettier contrôle **aussi le Markdown** : lancer `npm run format`
  après avoir modifié ce fichier ou le README, sinon la CI tombe.
- La CI tourne en Node 24. Une session cloud a Node 22 par défaut, ce qui suffit (`engines` :
  `>=20`).
- Une session de code n'a **ni instance Gladys ni appareil réel**. La suite de tests, le lint et
  le validateur du store sont les seules vérifications possibles : le test réel passe par
  Guilhem ou par les testeurs du forum. Le dire, plutôt que de conclure que « ça marche ».
- Le validateur du store (`npx -y github:GladysAssistant/integration-store`) exige Node 24 dans
  son `engines` mais tourne sous Node 22 (avertissement `EBADENGINE`, sans effet). Il signale
  `categories` non déclaré : avertissement seulement, l'intégration serait indexée.
- **Publier est un geste de Guilhem** : Actions → Release (patch, minor ou major) construit
  l'image `ghcr.io/guim31/<dépôt>`, monte la version du manifeste et pose le tag. Un correctif
  poussé sur `main` sans Release n'atteint aucune installation : le signaler.
- Le workflow Release reformate le manifeste avec Prettier, publie l'image et crée la **release
  GitHub** (notes générées depuis les PR, ou `.github/release-notes/vX.Y.Z.md` s'il existe) : c'est
  elle que Gladys ouvre par « Voir le changelog de cette version ». Les trois workflows (`ci`,
  `build`, `release`) sont communs aux intégrations de guim31 : ne pas les modifier dans un seul dépôt.
- Le dépôt est **public** : aucun secret, aucune adresse ni détail d'infrastructure privée, ni
  ici, ni dans les tests, ni dans les captures.

## Pièges du cœur Gladys (communs aux intégrations de guim31)

Vérifiés dans le code du cœur ou payés sur une intégration publiée. Ils valent pour toutes.

**Appareils et fonctionnalités**

- **Polling** : le planificateur n'interroge un appareil que si `should_poll: true` **et**
  `poll_frequency` vaut une valeur de la liste fixe (1000, 2000, 10000, 15000, 30000, 60000 ms).
  Publier seulement `poll_frequency` donne un appareil accepté mais jamais interrogé. Pour une
  cadence hors liste, publier `should_poll: false` et pousser les états depuis le conteneur, en
  gardant un `onPoll` de repli.
- **`min` et `max` sont NOT NULL** dans `t_device_feature`, y compris pour `text/text` : sans eux,
  « Ajouter à Gladys » échoue en HTTP 422. Mettre 0/0, comme Zigbee2MQTT.
- `level-sensor/decimal` n'existe pas côté serveur. `light-sensor/binary` n'a pas de libellé dans
  le front (pastille vide) : préférer `input/binary`. Un `text/text` reçoit `{ text }`, jamais
  vide, sinon l'état est ignoré.
- Les **noms de fonctionnalités sont figés à la création**. Et quand une fonctionnalité est seule
  de son type sur l'appareil, le tableau de bord affiche le libellé générique du type à la place
  du nom publié (`getDeviceFeatureName` du front).
- **Un `external_id` de fonctionnalité ne doit jamais changer d'appareil** d'une version à
  l'autre. Le cœur exige un `external_id` de fonctionnalité unique sur toute la base : les
  utilisateurs qui avaient ajouté l'ancien appareil ne peuvent plus ajouter ni mettre à jour le
  nouveau (HTTP 409 `external_id must be unique`), et l'ancien appareil, plus publié, ne disparaît
  pas de lui-même. Déplacer une fonctionnalité, c'est soit lui donner un nouvel `external_id`
  (historique perdu), soit continuer à publier l'ancien appareil tant que `getDevices()` le
  renvoie (voir « Switch PoE » ci-dessus).
- Depuis Gladys 4.84, un changement de structure fait proposer « Mettre à jour » dans l'onglet
  Découverte (`structure_changed`) : plus besoin de supprimer et recréer l'appareil. Un
  changement des seules `supported_options` ne le déclenche pas.
- **Jauge** : l'aiguille se place par `(value - min) / (max - min)` des bornes de la
  fonctionnalité. `gauge_min`/`gauge_max` ne pilotent que les couleurs, et le cœur n'applique
  jamais `min`/`max` en écriture : ce sont des bornes d'affichage. Une valeur signée exige des
  bornes symétriques.
- Le cœur plafonne à **300 états par minute** et réévalue les scènes à chaque état : ne publier
  que les changements. **Publier pour un appareil non ajouté gaspille ce quota** : le cœur
  l'ignore (« DeviceFeature … not found (or not added to Gladys) ») mais le compte. Filtrer sur
  les appareils créés (`gladys.devices`). Mais un état identique n'est pas inutile pour tout le
  monde : le cœur met à jour `last_value_changed` à chaque état, et l'action « Vérifier la
  présence » s'en sert ; republier « présent » périodiquement.
- Une intégration `device` ne reçoit pas la langue de l'utilisateur, une action de scène non
  plus (un widget, si) : prévoir un champ de config `language`. Le superviseur injecte `TZ`, le
  fuseau de Gladys, dans le conteneur. La sandbox est limitée à 256 Mo.

**Formulaires de configuration et actions**

- Les champs `number` sont rendus en `<input type="number" min max>` **sans `step`** (le
  manifeste n'en accepte pas) : le navigateur n'accepte alors que `min + k`. Min et défaut
  **entiers** seulement ; une valeur décimale passe par un `select` ou par un `string` parsé
  (virgule acceptée).
- Un champ `secret` dans les `fields` d'une **action** est impossible à remplir (la saisie
  s'efface à chaque frappe), et une action n'applique **aucun `default`**, ni à l'affichage ni
  côté serveur, tout en exigeant les champs `required` (422).

**Widgets, déclencheurs, actions de scène (SDK ≥ 0.14, Gladys ≥ 5.1)**

- Budget du cœur : **8 composants par widget, dont 2 textes au plus**. Le validateur du SDK le
  signale ; `validateWidgetContent` est exporté pour les tests. Il vérifie aussi la longueur de
  **chaque langue** d'un texte `{ en, fr }` (une `caption` de 86 caractères en français est
  refusée alors que l'anglais tient en 80).
- Un `status` exige **1 à 10 lignes** : un filtre qui ne laisse rien (« présents seulement »,
  personne à la maison) doit remplacer la liste par un texte, jamais l'envoyer vide.
- Un bouton `device_feature` passe par `onSetValue` : la fonctionnalité doit exister dans Gladys
  (appareil ajouté depuis la Découverte), sinon le bouton ne fait rien. Même chose pour une tuile
  ou un graphique liés : sans appareil créé, rien à afficher.
- Le cœur **jette un bouton dont la clé d'action est déjà prise** : clés numérotées, ce que fait
  le bouton dans ses paramètres.
- Le vocabulaire des widgets n'a ni liste ni curseur. Seul un bouton `device_feature` numérique
  a un état actif natif.
- Dans une grille `card-list`, la `date` s'affiche **à la place** du sous-titre.
- `onWidgetAction` fait recharger le widget dès la résolution, alors que `requestWidgetRefresh`
  est plafonné à un appel toutes les 10 s.
- Les filtres de scène ne font qu'égalité et appartenance : un seuil (Kp > 6) reste le travail
  d'un capteur.
- **Les clés de widgets, de déclencheurs et d'actions sont figées une fois publiées.**
- Passer `gladys_version` à `>=5.1.0` coupe les mises à jour des cœurs plus anciens, qui
  refusent les champs inconnus du manifeste.

## Publication et store

- Avant de demander une Release ou le topic, lancer le validateur officiel depuis la racine :
  `npx -y github:GladysAssistant/integration-store`. Il vérifie le schéma, la `description`
  (**100 caractères au plus par langue**), la documentation (300 caractères au moins), l'image
  Docker et la cover (**150 Ko au plus**).
- Le topic `gladys-assistant-integration` fait indexer le dépôt ; Guilhem le pose (le jeton de
  l'agent n'en a pas le droit). L'indexeur passe à H:13 chaque heure, souvent avec une demi-heure
  de retard, et rejette **en silence** : la raison n'apparaît que dans `rejected.json`, à côté de
  l'index `https://integration-store-storage.gladysassistant.com/index.json`.
- Sans topic, on installe par la carte « Installer depuis GitHub » (URL du dépôt, Gladys ≥ 4.84) :
  le cœur lit le manifeste sur `main` et propose les mises à jour à chaque rafraîchissement du
  catalogue.
- La règle `data/` du `.gitignore` du template (pour le volume `/data`) exclut aussi `src/data/` :
  l'ancrer en `/data/`, dans `.prettierignore` aussi. Avant de pousser un dépôt neuf, tester sur
  un `git clone` propre, pas sur la copie de travail.

# Debulgado's Coffee Shop POS

A point-of-sale web app with sales history and statistics, hosted on Vercel at
**https://debulgado.vercel.app**. Open the address on any laptop (or phone) and sell.
Sales are saved on the device first, so it keeps working without internet and uploads
everything when the connection comes back.

## What's in this folder

```
index.py                  starts the server (Vercel finds it by itself)
vercel.json               Vercel settings: Flask, server in Singapore
requirements.txt          Python packages Vercel installs
config.py                 settings for running on your own PC (online, use Vercel's Environment Variables)
database/
  debulgado_pos.sql       the MySQL database: tables, report views, and your menu
app/                      the server, in Model-View-Controller form
  models/                 read and write the database (orders, menu, shop, devices, backup)
  controllers/            handle each request (sign-in, sync, backup download, pages)
  routes.py               which web address goes to which controller
  database.py             connects to MySQL
public/                   the views: the app that runs in the browser
  index.html              the POS
  order.html              the customer's order page (opened from the order QR)
  js/models  js/views  js/controllers  js/services
  js/order/               the customer's order page (model, view, controller, camera scanner)
android-kotlin/           code for the Android app (for later)
```

## Put it online (one time, about 15 minutes)

Vercel runs the app but can't keep files, so the shop's data lives in a free online
MySQL database. These steps use **TiDB Cloud**, which speaks MySQL and has a free plan.

### Step 1. Create the database (TiDB Cloud)

1. Sign up at **tidbcloud.com** (free; no card needed for the free plan).
2. Create a **Starter** cluster.
   - **Region:** pick **Singapore** if it's in the list. It's closest to the Philippines and to the Vercel server, so sales upload faster.
3. Open the cluster, then click **Connect** (top right).
4. Choose **Connection Type: Public**, **Connect With: General**, then click **Generate Password**.
5. Keep that window open. You need its **Host**, **Port**, **User** and **Password** in the next step.

You don't need to create tables or import anything. The app builds them itself on its first run.

### Step 2. Give Vercel the database details

1. In Vercel, open the **debulgado** project, then **Settings → Environment Variables**.
2. Add these five variables, with **Production** and **Preview** both ticked.
   You can paste all five at once into the first Key box:
   ```
   MYSQL_HOST=gateway01.ap-southeast-1.prod.aws.tidbcloud.com
   MYSQL_PORT=4000
   MYSQL_USER=xxxxxxxx.root
   MYSQL_PASSWORD=the-password-you-generated
   MYSQL_DATABASE=debulgado
   ```
   - Use your own host, user and password from TiDB.
   - `debulgado` is created automatically.
3. Click **Save**.

The passwords stay in Vercel, never in your GitHub repository.

### Step 3. Replace the old version in your GitHub repository

The repository still has the previous version (with `package.json`, `server/`, `android/` and so on).
Those old files must go, or Vercel may build the wrong thing.

1. Open your local copy of the `debulgado` repository.
2. Delete everything in it **except the hidden `.git` folder**.
3. Unzip `debulgado-pos.zip` and copy everything **inside** its `debulgado-pos` folder into the repository folder.
4. Commit and push to `main`:
   - **GitHub Desktop:** write a summary such as "Version 3", click **Commit to main**, then **Push origin**.
   - **Command line:**
     ```
     git add -A
     git commit -m "Version 3: Flask + MySQL"
     git push
     ```

Vercel builds and publishes it by itself in about a minute (watch **Deployments**).

### Step 4. Open it

Go to **https://debulgado.vercel.app**. The first screen asks you to **create the shop password**.
That's it.

If it says **"The server needs its database"**, the Environment Variables weren't there when it was built.
Open **Deployments**, click **⋯** on the newest one, then **Redeploy**.

## Using it on the desktop

- **First laptop:** create the shop password.
- **Each other laptop or phone:** open the same address, enter the shop password once, and name the device.
  - Each device gets its own receipt letter (C for "Counter laptop"), so receipt numbers never clash.
- **Install it like a program:** Settings → **Install app**, or the install icon in Chrome or Edge's address bar.
  It gets its own window and icon, and opens even without internet.
- **The badge in the corner** shows the sync state: "Synced just now", "Offline · 3 to upload", or "Signed out".
- **Product photos:** Menu → **Edit** on a product → **Upload photo** (or drag a picture onto the box).
  - The photo is shrunk to a small JPEG on the device, saved in the `products.image` column, and shown on the POS card.
  - It reaches the other devices on the next sync and works offline.
- **Taking payment:** tap **Pay** on the order ticket.
  - The payment window has the discount, Cash or GCash, the amount tendered (or the optional GCash reference), and the change.
  - **Confirm payment** records the sale.
- **Removing items:** **Remove** asks first. To remove several, tap **Select** on the ticket, tick the items, then **Delete**.
- **Settings → Download database (.sql):** the whole shop database as a MySQL file.
  Import it into phpMyAdmin or XAMPP, or keep it as a backup.
- **Settings → Change shop password:** signs out every other device. Use this if a phone goes missing.
  Their unsent sales stay safe and upload when they sign in again.

**Updating the app later:** change files, commit and push to `main`.
Vercel publishes the new version, and each device picks it up the next time it's opened.

## Online orders (customers order from their own phone)

1. **Print the QR codes:** on the POS, open **Online orders** (under the order ticket), then **QR codes**, then **Print**.
   You can also find them in **Settings → Online orders**.
   - **Order QR:** put it on tables, the door or the menu board. It opens the menu on the customer's phone (no app to install).
   - **Counter QR:** keep it at the counter.
2. **The customer** picks drinks, enters their **name** (required), and taps **Pay**.
   - The phone's camera opens, and they scan the counter QR. That sends the order.
   - Because of this scan, orders only come from people who are in the shop.
   - No camera, or it's blocked? They type the code printed under the counter QR.
   - Their phone then shows "Order sent!" with their name, and changes to "Paid" when you take payment.
3. **On the POS** the **Online orders** bar lights up with the names, and a sound plays.
   - Tap the bar, then **Open in ticket** on an order. Its items land on the ticket with the customer's name.
   - Take payment as usual. The receipt, History and the CSV show the name.
   - **Put back** returns an order to the list without paying. **Cancel order** removes it, and the customer's phone shows it was cancelled.
4. **Closing time:** untick **Taking phone orders** in the Online orders window. Customers then see that phone orders are closed.
5. **If someone copies the counter QR:** QR codes → **New counter code**, then print and replace it. The old one stops working.

Good to know:
- Prices always come from the shop's menu on the server; a phone can't change them.
- Online orders need the internet. Everything else on the POS still works offline.
- The POS checks for new online orders every 15 seconds while it's on screen, and once a minute when phone orders are closed.
  Each check is a request to Vercel, so close phone orders when the shop is closed.
- The customer page is at **https://debulgado.vercel.app/order**.

## The database

- **`database/debulgado_pos.sql`** is the MySQL database file.
  - Tables: `orders`, `order_items`, `order_item_addons`, `online_orders`, `categories`, `products`, `addons`, `addon_categories`, `shop_settings`, `devices`, `app_settings`.
  - Report views: `daily_sales` and `product_sales`.
  - It also includes the starting menu.
  - **phpMyAdmin / XAMPP:** create a database, open it, use **Import**, and choose this file.
- **Your live data as a file:** Settings → **Download database (.sql)**.
- **Browse the live data:** TiDB Cloud has a **SQL Editor** where you can run, for example,
  `SELECT * FROM daily_sales;` against the `debulgado` database.
- Money is stored in pesos with 2 decimals. Order times are the shop's local time.
- **Updating from an older version:** a database made by an older version gets the new parts (the `online_orders` table, `products.image`, `orders.customer_name`) added automatically the next time the app starts. Nothing is deleted.
- The shop password is stored only as a secure hash, never as plain text.

**Using a different MySQL host** (Aiven, a school server…):
- Put its details in the same five variables.
- If the connection fails with a certificate error, add `MYSQL_SSL=require`. If the server has no secure connection at all, add `MYSQL_SSL=off`.
- One `DATABASE_URL=mysql://USER:PASSWORD@HOST:PORT/debulgado` also works instead of the five.

## If something goes wrong

- **The app shows a database message:** it names the problem (wrong password, server unreachable…).
  1. Fix the variable in Vercel.
  2. Redeploy.
- **The build fails:**
  1. Open the deployment and read the build log.
  2. If it mentions `npm`, open **Settings → Build and Deployment** and switch off any **Override** toggles left over from the old version.
  3. `vercel.json` already tells Vercel this is a Flask app.
- **Server errors:** Vercel → project → **Logs**.

## Android app (later)

`android-kotlin/` has the Kotlin code for an Android Studio "Empty Views Activity" project. It
opens https://debulgado.vercel.app full-screen and works offline after the first visit.

1. Replace these files in your Android Studio project with the ones in `android-kotlin/`:
   - `MainActivity.kt` (keep your own `package` line at the top)
   - `res/layout/activity_main.xml`
   - `res/values/strings.xml`
2. Add the two marked lines from `android-kotlin/AndroidManifest.xml` to your manifest.

No extra libraries are needed. Photo upload in the Menu opens the phone's photo picker.

## Good to know

- Receipts are not BIR official receipts.
- The senior/PWD discount is a plain percentage of the order; VAT-exemption rules are not modeled.
- The manager PIN (Settings → Shop) protects voids, menu changes and shop details on every device.
- On your own PC without internet hosting:
  1. `pip install -r requirements.txt`
  2. `python index.py`
  3. Open http://localhost:5000. It uses your XAMPP MySQL if `config.py` has its details, otherwise a local SQLite file.

# Share a recipe from your phone

Recipe import (admin only) accepts a link from your phone's share sheet. It opens `/recipes/import` and starts reading the page.

## Android

1. Open the app in Chrome and install it (menu, "Install app" / "Add to Home screen"). Share targets only work for the installed app.
2. In any app or browser, tap Share on a recipe page or video and pick **Meal Prep**.
3. The import opens and starts reading the link. If the share contains only text (no link), the Paste text tab opens with it filled in; nothing is sent until you press Read.

If you installed the app before this feature shipped, remove it and install it again so Android picks up the new share option.

## iPhone (Shortcut)

Safari cannot receive shares directly, so add a Shortcut that sends the link to the import page.

1. Open the **Shortcuts** app, tap **+** to make a new shortcut and name it "Import recipe".
2. Tap the **i** (details) button and turn on **Show in Share Sheet**. Under "Share Sheet Types" keep only **URLs**, **Safari web pages** and **Text**.
3. Add the action **URL** and enter `https://<your app domain>/recipes/import?url=` then tap the **Shortcut Input** variable to put it right after `url=`.
4. Add the action **Open URLs** (it opens the URL from the previous step).
5. Tap Done. If the shortcut does not appear in the share sheet, scroll to the bottom of the share sheet, tap **Edit Actions** and add it to Favorites.
6. Use it: in Safari (or any app) tap Share, pick **Import recipe**. The first time, iOS asks for permission to open the link; tap **Allow**.

Tips:
- If the link has `&` or other special characters in it, add a **URL Encode** action before step 3's URL action (input: Shortcut Input) and use its result after `url=`.
- You must be signed in. If your session expired you are sent to the sign-in page and brought back to the import afterwards.

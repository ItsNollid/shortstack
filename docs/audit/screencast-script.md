# Screencast script

A single unbroken recording, roughly five minutes. Record with the dev profile or a real channel,
but do not show credentials on screen. Say what you are doing as you do it.

---

**1. First launch — the legal gate (~30s)**

Start ShortStack with no settings. The first screen explains what the app does, then offers the
Privacy Policy and Terms. Open the Privacy Policy dialog, scroll it, close it. Tick the box, press
**Agree and continue**.

> "Nothing in the app is reachable until the privacy policy and terms are accepted. Both are
> readable here with no network."

**2. Setup and consent (~40s)**

Install the `client_secret.json`. Press **Connect**; the Google consent screen opens in the real
browser. Point out the scopes being requested and approve. Back in ShortStack, the channel name and
picture appear — in the sidebar, the title bar, and the taskbar icon.

> "The credentials are my own Google Cloud project. ShortStack never sees a password; the token is
> encrypted with Windows' own secure storage."

**3. Scan and edit (~30s)**

Choose the videos folder, press **Scan**. Open one video. Show the title and description counters,
and that the description limit is measured in bytes. Change the visibility and point out it can
always be changed.

**4. Suggestions stay under the user's control (~35s)**

Press **Suggest**. Show that nothing changed in the form. Several titles are offered; take one with
**Use this** and point out the description and tags are still untouched. On the description, show the
three choices — replace it, add to the start, add to the end — and take one. Press **Save**.

> "Suggestions come from a model running on this computer, and they are never applied on their own.
> Each one is a choice I make, field by field."

**4b. Choosing where a video goes (~20s)**

On the same video, show the platform switches: YouTube, TikTok, Instagram. Turn TikTok on, then off
again.

> "Each platform is its own switch, per video, and off unless I turn it on. ShortStack holds no
> account with TikTok or Instagram — it prepares the file and opens their site for me to post."

**5. Approval names what will happen (~30s)**

Press **Approve**. Read the dialog aloud: the channel, what will happen without asking again, and
each video's visibility and publish time. Confirm.

**6. Scheduling (~45s)**

Open the Calendar. Drag the video onto a day; show the time that gets picked and the Undo. Drag one
onto a past day to show the refusal.

Press **Fill the calendar**. Read the list of times it offers before anything changes, point out that
a video still waiting for approval is marked as such, then confirm, and undo it from the message.

> "Giving a video a time is not approving it. Nothing on this screen uploads or publishes anything."

Open **History** and show the entries, including which ones ShortStack did on its own.

**7. Assisted upload (~30s)**

Back on the video, walk through the assisted panel: reveal the file, open Studio, copy the title,
and the exact time to set.

> "Until this project passes the audit, an upload through the API would be locked private for good,
> so ShortStack hands me everything and I upload it myself."

**8. Revoking access (~25s)**

Settings → Legal and data → **Disconnect and delete YouTube data**. Read the dialog. Confirm. Show
the channel name and picture gone, and the icon back to the ShortStack mark.

> "That revokes the token with Google straight away and deletes everything stored about the
> channel. My videos on YouTube are untouched."

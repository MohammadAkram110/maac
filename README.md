# My Shift & Life Digital Diary

This web edition uses the current Windows diary's interface, default tasks and roster routines. The diary saves its entries and attachments in the browser where you open it.

## Upload to GitHub and deploy

1. Extract the ZIP. Upload the extracted files to the root of your GitHub repository. Check that `index.html`, `styles.css`, `app.js` and `vercel.json` are visible on the repository's first page, with the other scripts, icons and manifest alongside them. Commit the files to your production branch.
2. In Vercel, select **Add New → Project**, import your GitHub repository and select **Deploy**. Use the repository root and the **Other** framework preset. The included `vercel.json` sets the output to `.` and leaves the build and install commands empty. [Vercel deployment documentation](https://vercel.com/docs/deployments/overview)
3. Open the production HTTPS address on your phone and second laptop. Load it once online on each browser to cache the app for offline use. Use your browser's install or **Add to Home Screen** option if available.

For an existing GitHub-connected Vercel project, update the app files on its production branch and keep using the same production address. Save open edits first. If the previous version still opens, use **Settings & Backups → Reload with update** when it appears, or close the diary tabs and reopen the address.

## Device records and backups

- Your phone browser and second laptop browser each save their own diary. Different browsers or profiles on one device also have their own records. Your Windows one-click diary continues to use its `.shiftlife` file.
- Each fresh browser starts with the built-in tasks and routines. To copy your own entries, roster, settings and attachments, open **Settings & Backups → Download JSON backup** in the diary that has them. On the destination browser, choose **Restore backup**, review the preview and choose the restore method.
- Keep backups outside the repository. Upload only the app files from the ZIP. Clearing browser site data removes that browser's saved diary. Keep using the same HTTPS address and browser profile to reopen those records.
- When updating from the earlier v7 web edition, existing tasks and attachments use the same browser storage. Saved prayer times that the current timetable can't display, including Jumu’ah times, are copied to the day's faith reflection. Original v7 schedule and worship fields remain in the JSON backup.

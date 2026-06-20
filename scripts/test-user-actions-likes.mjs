#!/usr/bin/env node
/** Live probe for getquicker User/Actions likes (maintainers). */

import { computeFromLiveUrl } from "./quickerbench/lib/user-actions-likes.mjs";

const url = process.argv[2] ?? "https://getquicker.net/User/Actions/113342-Cea";

computeFromLiveUrl(url)
  .then((report) => {
    console.log(
      JSON.stringify(
        {
          url: report.url,
          pages: report.pages,
          totalActions: report.totalActions,
          parsedCount: report.parsedCount,
          totalLikes: report.totalLikes,
          top5: report.top5,
        },
        null,
        2,
      ),
    );
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

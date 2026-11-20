# Phira Web

An independent, static web client for browsing and downloading Phira charts and looking up account-related data. The interface is built with plain HTML, CSS, and JavaScript modules and talks directly to the Phira API from the browser.

**This project does not provide chart gameplay.** It is not an official Phira product and is not affiliated with TeamFlos.

[简体中文](README.zh-CN.md)

## Features

- Browse, search, sort, and filter community charts; view popular charts.
- View chart details, artwork, metadata, and download the chart package.
- View a chart's top 15 records, with a standard-score option.
- Sign in to a Phira account and view basic profile data, including the account ID and RKS.
- Save favorites locally when signed out, or manage cloud collections when signed in.
- Use the responsive interface on desktop and mobile screens.

Chart packages are downloaded for use outside this website. The site does not parse charts, play audio, simulate scores, or submit scores.

## Run Locally

No build step or package installation is required. Serve the project root over HTTP; opening `index.html` directly with a `file://` URL is not supported because the app uses JavaScript modules and browser API requests.

With Python 3:

```sh
python3 -m http.server 8000
```

On Windows, you can use:

```powershell
py -m http.server 8000
```

Then open <http://localhost:8000>.

## API and Deployment

- API host: <https://phira.5wyxi.com>
- API reference: <https://muimi.club/phira-api/> (community-maintained, unofficial documentation)
- No application backend is included. API requests are made directly by the browser.
- The API must permit requests from the site's origin through CORS. A static frontend cannot bypass a CORS restriction; deployment may require the API operator to allow the deployed origin.
- Chart file URLs are provided by the API. Depending on the file host and browser, a download may open in a new tab or be handled by the browser's normal download behavior.
- Serve production deployments over HTTPS, especially when signing in.

## Account Data and Privacy

Signing in sends credentials directly from the browser to the Phira API. The returned session is stored in the browser's local storage so the site can maintain the sign-in state and make authenticated requests. Signing out removes that session from local storage. Do not sign in on a shared or untrusted device.

Unsigned favorites are also stored locally in the browser. This project does not include its own server, account database, analytics, or telemetry.

## Project Structure

```text
.
├── index.html
├── styles.css
├── src/
│   ├── api.js
│   └── app.js
└── docs/
    └── design-and-development-plan.md
```

## Branding and Assets

This is an independent community project. It does not use Phira's official branding or non-chart artwork. Chart artwork shown in the interface is supplied as part of chart data by the Phira service.

## License

No license has been specified for this repository yet. Contact the maintainers before redistributing or reusing the source code.

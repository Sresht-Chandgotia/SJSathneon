from flask import Flask, render_template, jsonify, request
import requests
import html

app = Flask(__name__)

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/about')
def about():
    return render_template('about.html')


# ✅ Optimized dynamic suggestion endpoint
@app.route('/api/suggest')
def suggest():
    query = request.args.get("q", "").strip()
    if not query:
        return jsonify({"results": []})

    # Clean up smart quotes, HTML chars, etc.
    query = html.unescape(query)
    query = query.replace("’", "'").replace("‘", "'").replace('"', "")

    url = "https://nominatim.openstreetmap.org/search"
    headers = {"User-Agent": "NavHUD/3.0"}

    # Step 1: Primary search
    params_full = {
        "q": query,
        "format": "json",
        "addressdetails": 1,
        "limit": 8,
    }

    # Step 2: Fallback (if too few results)
    fallback_query = None
    if "," in query:
        # try everything before the comma
        fallback_query = query.split(",")[0]
    elif len(query.split()) > 2:
        # try last two words
        fallback_query = " ".join(query.split()[-2:])

    try:
        # main query
        r1 = requests.get(url, params=params_full, headers=headers, timeout=6)
        data_full = r1.json() if r1.status_code == 200 else []

        # fallback if few or no results
        data_fallback = []
        if (len(data_full) < 3 or not data_full) and fallback_query:
            params_fb = {
                "q": fallback_query,
                "format": "json",
                "addressdetails": 1,
                "limit": 5,
            }
            r2 = requests.get(url, params=params_fb, headers=headers, timeout=6)
            data_fallback = r2.json() if r2.status_code == 200 else []

        # merge + deduplicate
        seen = set()
        combined = []
        for d in data_full + data_fallback:
            name = d.get("display_name")
            if name and name not in seen:
                combined.append(d)
                seen.add(name)

        return jsonify({"results": combined[:10]})

    except Exception as e:
        print("Error fetching suggestions:", e)
        return jsonify({"results": []})


if __name__ == '__main__':
    app.run(debug=True)

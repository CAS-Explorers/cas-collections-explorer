
// const countryEmojis: { [key: string]: string } = {
//   "United States": "🇺🇸",
//   Canada: "🇨🇦",
//   Mexico: "🇲🇽",
//   "United Kingdom": "🇬🇧",
//   Germany: "🇩🇪",
//   France: "🇫🇷",
//   Italy: "🇮🇹",
//   Spain: "🇪🇸",
//   Australia: "🇦🇺",
//   India: "🇮🇳",
//   China: "🇨🇳",
//   Japan: "🇯🇵",
//   Brazil: "🇧🇷",
//   "South Africa": "🇿🇦",
//   "Costa Rica": "🇨🇷",
//   Argentina: "🇦🇷",
//   Chile: "🇨🇱",
//   Colombia: "🇨🇴",
//   Peru: "🇵🇪",
//   "New Zealand": "🇳🇿",
//   Russia: "🇷🇺",
//   "South Korea": "🇰🇷",
//   Sweden: "🇸🇪",
//   Norway: "🇳🇴",
//   Finland: "🇫🇮",
//   Denmark: "🇩🇰",
//   Netherlands: "🇳🇱",
//   Belgium: "🇧🇪",
//   Switzerland: "🇨🇭",
//   Austria: "🇦🇹",
//   Greece: "🇬🇷",
//   Portugal: "🇵🇹",
//   Turkey: "🇹🇷",
//   Israel: "🇮🇱",
//   Egypt: "🇪🇬",
//   "Saudi Arabia": "🇸🇦",
//   "United Arab Emirates": "🇦🇪",
//   Singapore: "🇸🇬",
//   Malaysia: "🇲🇾",
//   Thailand: "🇹🇭",
//   Vietnam: "🇻🇳",
//   Philippines: "🇵🇭",
//   Indonesia: "🇮🇩",
//   Bangladesh: "🇧🇩",
//   Pakistan: "🇵🇰",
//   Iraq: "🇮🇶",
//   Iran: "🇮🇷",
//   Afghanistan: "🇦🇫",
//   Kazakhstan: "🇰🇿",
//   Ukraine: "🇺🇦",
//   Poland: "🇵🇱",
//   "Czech Republic": "🇨🇿",
//   Hungary: "🇭🇺",
//   Slovakia: "🇸🇰",
//   Romania: "🇷🇴",
//   Bulgaria: "🇧🇬",
//   Serbia: "🇷🇸",
//   Croatia: "🇭🇷",
//   Slovenia: "🇸🇮",
//   Lithuania: "🇱🇹",
//   Latvia: "🇱🇻",
//   Estonia: "🇪🇪",
//   Moldova: "🇲🇩",
//   Georgia: "🇬🇪",
//   Armenia: "🇦🇲",
//   Azerbaijan: "🇦🇿",
//   Jamaica: "🇯🇲",
//   "Dominican Republic": "🇩🇴",
//   Haiti: "🇭🇹",
//   Cuba: "🇨🇺",
//   Barbados: "🇧🇧",
//   "Trinidad and Tobago": "🇹🇹",
//   Bahamas: "🇧🇸",
//   "Saint Lucia": "🇱🇨",
//   "Saint Vincent and the Grenadines": "🇻🇨",
//   Grenada: "🇬🇩",
//   "Antigua and Barbuda": "🇦🇬",
//   Dominica: "🇩🇲",
//   Belize: "🇧🇿",
//   Guatemala: "🇬🇹",
//   "El Salvador": "🇸🇻",
//   Nicaragua: "🇳🇮",
//   Panama: "🇵🇦",
//   // Add more countries and their emojis as needed
// };

// export const getCountryEmoji = (country: string): string => {
//   return countryEmojis[country] || ""; // Return empty string if country not found
// };
interface CountryInfo {
  emoji: string;
  alpha2: string;
  alpha3: string;
}

const countryData: { [key: string]: CountryInfo } = {
  "United States": {
    emoji: "🇺🇸",
    alpha2: "US",
    alpha3: "USA"
  },
  "Canada": {
    emoji: "🇨🇦",
    alpha2: "CA",
    alpha3: "CAN"
  },
  "Mexico": {
    emoji: "🇲🇽",
    alpha2: "MX",
    alpha3: "MEX"
  },
  "United Kingdom": {
    emoji: "🇬🇧",
    alpha2: "GB",
    alpha3: "GBR"
  },
  "Germany": {
    emoji: "🇩🇪",
    alpha2: "DE",
    alpha3: "DEU"
  },
  "France": {
    emoji: "🇫🇷",
    alpha2: "FR",
    alpha3: "FRA"
  },
  "Italy": {
    emoji: "🇮🇹",
    alpha2: "IT",
    alpha3: "ITA"
  },
  "Spain": {
    emoji: "🇪🇸",
    alpha2: "ES",
    alpha3: "ESP"
  },
  "Australia": {
    emoji: "🇦🇺",
    alpha2: "AU",
    alpha3: "AUS"
  },
  "India": {
    emoji: "🇮🇳",
    alpha2: "IN",
    alpha3: "IND"
  },
  "China": {
    emoji: "🇨🇳",
    alpha2: "CN",
    alpha3: "CHN"
  },
  "Japan": {
    emoji: "🇯🇵",
    alpha2: "JP",
    alpha3: "JPN"
  },
  "Brazil": {
    emoji: "🇧🇷",
    alpha2: "BR",
    alpha3: "BRA"
  },
  "South Africa": {
    emoji: "🇿🇦",
    alpha2: "ZA",
    alpha3: "ZAF"
  },
  "Costa Rica": {
    emoji: "🇨🇷",
    alpha2: "CR",
    alpha3: "CRI"
  },
  "Argentina": {
    emoji: "🇦🇷",
    alpha2: "AR",
    alpha3: "ARG"
  },
  "Chile": {
    emoji: "🇨🇱",
    alpha2: "CL",
    alpha3: "CHL"
  },
  "Colombia": {
    emoji: "🇨🇴",
    alpha2: "CO",
    alpha3: "COL"
  },
  "Peru": {
    emoji: "🇵🇪",
    alpha2: "PE",
    alpha3: "PER"
  },
  "New Zealand": {
    emoji: "🇳🇿",
    alpha2: "NZ",
    alpha3: "NZL"
  },
  "Russia": {
    emoji: "🇷🇺",
    alpha2: "RU",
    alpha3: "RUS"
  },
  "South Korea": {
    emoji: "🇰🇷",
    alpha2: "KR",
    alpha3: "KOR"
  },
  "Sweden": {
    emoji: "🇸🇪",
    alpha2: "SE",
    alpha3: "SWE"
  },
  "Norway": {
    emoji: "🇳🇴",
    alpha2: "NO",
    alpha3: "NOR"
  },
  "Finland": {
    emoji: "🇫🇮",
    alpha2: "FI",
    alpha3: "FIN"
  },
  "Denmark": {
    emoji: "🇩🇰",
    alpha2: "DK",
    alpha3: "DNK"
  },
  "Netherlands": {
    emoji: "🇳🇱",
    alpha2: "NL",
    alpha3: "NLD"
  },
  "Belgium": {
    emoji: "🇧🇪",
    alpha2: "BE",
    alpha3: "BEL"
  },
  "Switzerland": {
    emoji: "🇨🇭",
    alpha2: "CH",
    alpha3: "CHE"
  },
  "Austria": {
    emoji: "🇦🇹",
    alpha2: "AT",
    alpha3: "AUT"
  },
  "Greece": {
    emoji: "🇬🇷",
    alpha2: "GR",
    alpha3: "GRC"
  },
  "Portugal": {
    emoji: "🇵🇹",
    alpha2: "PT",
    alpha3: "PRT"
  },
  "Turkey": {
    emoji: "🇹🇷",
    alpha2: "TR",
    alpha3: "TUR"
  },
  "Israel": {
    emoji: "🇮🇱",
    alpha2: "IL",
    alpha3: "ISR"
  },
  "Egypt": {
    emoji: "🇪🇬",
    alpha2: "EG",
    alpha3: "EGY"
  },
  "Saudi Arabia": {
    emoji: "🇸🇦",
    alpha2: "SA",
    alpha3: "SAU"
  },
  "United Arab Emirates": {
    emoji: "🇦🇪",
    alpha2: "AE",
    alpha3: "ARE"
  },
  "Singapore": {
    emoji: "🇸🇬",
    alpha2: "SG",
    alpha3: "SGP"
  },
  "Malaysia": {
    emoji: "🇲🇾",
    alpha2: "MY",
    alpha3: "MYS"
  },
  "Thailand": {
    emoji: "🇹🇭",
    alpha2: "TH",
    alpha3: "THA"
  },
  "Vietnam": {
    emoji: "🇻🇳",
    alpha2: "VN",
    alpha3: "VNM"
  },
  "Philippines": {
    emoji: "🇵🇭",
    alpha2: "PH",
    alpha3: "PHL"
  },
  "Indonesia": {
    emoji: "🇮🇩",
    alpha2: "ID",
    alpha3: "IDN"
  },
  "Bangladesh": {
    emoji: "🇧🇩",
    alpha2: "BD",
    alpha3: "BGD"
  },
  "Pakistan": {
    emoji: "🇵🇰",
    alpha2: "PK",
    alpha3: "PAK"
  },
  "Iraq": {
    emoji: "🇮🇶",
    alpha2: "IQ",
    alpha3: "IRQ"
  },
  "Iran": {
    emoji: "🇮🇷",
    alpha2: "IR",
    alpha3: "IRN"
  },
  "Afghanistan": {
    emoji: "🇦🇫",
    alpha2: "AF",
    alpha3: "AFG"
  },
  "Kazakhstan": {
    emoji: "🇰🇿",
    alpha2: "KZ",
    alpha3: "KAZ"
  },
  "Ukraine": {
    emoji: "🇺🇦",
    alpha2: "UA",
    alpha3: "UKR"
  },
  "Poland": {
    emoji: "🇵🇱",
    alpha2: "PL",
    alpha3: "POL"
  },
  "Czech Republic": {
    emoji: "🇨🇿",
    alpha2: "CZ",
    alpha3: "CZE"
  },
  "Hungary": {
    emoji: "🇭🇺",
    alpha2: "HU",
    alpha3: "HUN"
  },
  "Slovakia": {
    emoji: "🇸🇰",
    alpha2: "SK",
    alpha3: "SVK"
  },
  "Romania": {
    emoji: "🇷🇴",
    alpha2: "RO",
    alpha3: "ROU"
  },
  "Bulgaria": {
    emoji: "🇧🇬",
    alpha2: "BG",
    alpha3: "BGR"
  },
  "Serbia": {
    emoji: "🇷🇸",
    alpha2: "RS",
    alpha3: "SRB"
  },
  "Croatia": {
    emoji: "🇭🇷",
    alpha2: "HR",
    alpha3: "HRV"
  },
  "Slovenia": {
    emoji: "🇸🇮",
    alpha2: "SI",
    alpha3: "SVN"
  },
  "Lithuania": {
    emoji: "🇱🇹",
    alpha2: "LT",
    alpha3: "LTU"
  },
  "Latvia": {
    emoji: "🇱🇻",
    alpha2: "LV",
    alpha3: "LVA"
  },
  "Estonia": {
    emoji: "🇪🇪",
    alpha2: "EE",
    alpha3: "EST"
  },
  "Moldova": {
    emoji: "🇲🇩",
    alpha2: "MD",
    alpha3: "MDA"
  },
  "Georgia": {
    emoji: "🇬🇪",
    alpha2: "GE",
    alpha3: "GEO"
  },
  "Armenia": {
    emoji: "🇦🇲",
    alpha2: "AM",
    alpha3: "ARM"
  },
  "Azerbaijan": {
    emoji: "🇦🇿",
    alpha2: "AZ",
    alpha3: "AZE"
  },
  "Jamaica": {
    emoji: "🇯🇲",
    alpha2: "JM",
    alpha3: "JAM"
  },
  "Dominican Republic": {
    emoji: "🇩🇴",
    alpha2: "DO",
    alpha3: "DOM"
  },
  "Haiti": {
    emoji: "🇭🇹",
    alpha2: "HT",
    alpha3: "HTI"
  },
  "Cuba": {
    emoji: "🇨🇺",
    alpha2: "CU",
    alpha3: "CUB"
  },
  "Barbados": {
    emoji: "🇧🇧",
    alpha2: "BB",
    alpha3: "BRB"
  },
  "Trinidad and Tobago": {
    emoji: "🇹🇹",
    alpha2: "TT",
    alpha3: "TTO"
  },
  "Bahamas": {
    emoji: "🇧🇸",
    alpha2: "BS",
    alpha3: "BHS"
  },
  "Saint Lucia": {
    emoji: "🇱🇨",
    alpha2: "LC",
    alpha3: "LCA"
  },
  "Saint Vincent and the Grenadines": {
    emoji: "🇻🇨",
    alpha2: "VC",
    alpha3: "VCT"
  },
  "Grenada": {
    emoji: "🇬🇩",
    alpha2: "GD",
    alpha3: "GRD"
  },
  "Antigua and Barbuda": {
    emoji: "🇦🇬",
    alpha2: "AG",
    alpha3: "ATG"
  },
  "Dominica": {
    emoji: "🇩🇲",
    alpha2: "DM",
    alpha3: "DMA"
  },
  "Belize": {
    emoji: "🇧🇿",
    alpha2: "BZ",
    alpha3: "BLZ"
  },
  "Guatemala": {
    emoji: "🇬🇹",
    alpha2: "GT",
    alpha3: "GTM"
  },
  "El Salvador": {
    emoji: "🇸🇻",
    alpha2: "SV",
    alpha3: "SLV"
  },
  "Nicaragua": {
    emoji: "🇳🇮",
    alpha2: "NI",
    alpha3: "NIC"
  },
  "Panama": {
    emoji: "🇵🇦",
    alpha2: "PA",
    alpha3: "PAN"
  }
};

//Turn country's code into country name
export const getCountryFromCode = (code: string): string | undefined => {
  const upperCode = code.toUpperCase();
  return Object.entries(countryData).find(
    ([_, data]) => data.alpha2 === upperCode || data.alpha3 === upperCode
  )?.[0];
};

export const getCountryEmoji = (country: string): string => {
  return countryData[country]?.emoji || ""; // Return empty string if country not found
};
export const getCountryAlpha2 = (country: string): string | undefined => { //undefined will trigger the existing "No results found" UI component in app/botany/page.tsx
  return countryData[country]?.alpha2;
};
export const getCountryAlpha3 = (country: string): string | undefined => {
  return countryData[country]?.alpha3;
};

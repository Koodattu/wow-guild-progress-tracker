import json

def combine_guild_files():
    """
    Combines finnish_guilds.json and finnish_guilds_mythic.json,
    removing duplicates based on name-realm combination.
    """

    # Read both JSON files
    with open('finnish_guilds.json', 'r', encoding='utf-8') as f:
        guilds = json.load(f)

    with open('finnish_guilds_mythic.json', 'r', encoding='utf-8') as f:
        guilds_mythic = json.load(f)

    # Use a dictionary to track unique guilds by name-realm combination
    unique_guilds = {}

    # Add guilds from both files
    for guild in guilds + guilds_mythic:
        # Create unique key from name and realm
        key = f"{guild['name']}-{guild['realm']}"

        # Only add if not already present (first occurrence wins)
        if key not in unique_guilds:
            unique_guilds[key] = guild

    # Convert dictionary back to list
    combined_guilds = list(unique_guilds.values())

    # Sort by name for better readability
    combined_guilds.sort(key=lambda x: x['name'].lower())

    # Write combined guilds to new file
    with open('finnish_guilds_combined.json', 'w', encoding='utf-8') as f:
        json.dump(combined_guilds, f, indent=2, ensure_ascii=False)

    print(f"Total guilds in finnish_guilds.json: {len(guilds)}")
    print(f"Total guilds in finnish_guilds_mythic.json: {len(guilds_mythic)}")
    print(f"Total unique guilds: {len(combined_guilds)}")
    print(f"Duplicates removed: {len(guilds) + len(guilds_mythic) - len(combined_guilds)}")
    print(f"\nCombined guilds written to: finnish_guilds_combined.json")

if __name__ == "__main__":
    combine_guild_files()

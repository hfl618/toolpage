import sqlite3

def check():
    try:
        conn = sqlite3.connect('local_debug.sqlite')
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        print("--- USERS TABLE ---")
        users = cursor.execute("SELECT id, username, role FROM users").fetchall()
        for u in users:
            print(f"ID: {u['id']}, Name: {u['username']}, Role: {u['role']}")

        print("\n--- COMPONENTS TABLE ---")
        comps = cursor.execute("SELECT id, user_id, name, model FROM components").fetchall()
        for c in comps:
            print(f"ID: {c['id']}, Owner: User_{c['user_id']}, Name: {c['name']}, Model: {c['model']}")

        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check()
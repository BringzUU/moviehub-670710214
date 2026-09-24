# API ที่หน้าเว็บของทีมต้องใช้ (ส่งให้ทีม Go)

ทีม:เฮีย  หน้าเว็บ: https://moviehub-670710214.vercel.app/

กติกา: ทุก endpoint ตอบเป็น JSON, ใส่ prefix `/api`, ใช้ชื่อ field แบบ camelCase เหมือน data.js ของหน้าเว็บ

| # | Method | Path | ใช้ทำอะไร (หน้าไหน) | ตัวอย่าง response |
|---|--------|------|----------------------|-------------------|
| 1 | GET | /api/movies | รายการหนังหน้า Movies | ดูด้านล่าง |
| 2 | GET | /api/movies/{id} | รายละเอียดหน้า MovieDetail | |
| 3 | GET | /api/movies?q=คำค้น | ค้นหา | |
| 4 | POST | /api/movies/{id}/reviews | ส่งรีวิวจาก ReviewForm | |
| 5 | | | | |

รายการ endpoint
#	Method	Path	ใช้ทำอะไร (หน้าไหน)	ส่งไป	Status code
1	GET	/api/movies	รายการหนังทั้งหมด (หน้า Movies, หน้าแรก)	-	200
2	GET	/api/movies/{id}	รายละเอียดหนังเรื่องเดียว (หน้า MovieDetail)	id ใน path	200, 404 ถ้าไม่มี id นี้
3	GET	/api/movies?q=คำค้น	ค้นหาหนังตามชื่อ	query q	200 (ไม่เจอให้ตอบ items ว่าง)
4	POST	/api/movies/{id}/reviews	ส่งรีวิวจากฟอร์ม ReviewForm	body { "text": "..." }	201, 400 ถ้า text สั้นกว่า 10 ตัวอักษร, 404 ถ้าไม่มีหนังเรื่องนี้
5	GET	/api/movies/{id}/reviews	แสดงรีวิวทั้งหมดของหนังเรื่องนั้น (หน้า MovieDetail)	id ใน path

## ตัวอย่าง JSON ต่อ endpoint
```json
{
  "id": 969681,
  "tmdbId": 969681,
  "title": "Spider-Man: Brand New Day",
  "titleTh": "สไปเดอร์-แมน: แบรนด์ นิว เดย์",
  "genre": "Science Fiction",
  "year": 2026,
  "rating": 7.9,
  "detail": "การเปิดเรื่องราวบทใหม่ของปีเตอร์ พาร์คเกอร์ และสไปเดอร์-แมน",
  "poster": "https://image.tmdb.org/t/p/w342/bjiS5ipwxb9JFy3XRRN4OAilSeX.jpg"
}
```
### GET /api/movies

```json
{
  "items": [
    {
      "id": 969681,
      "title": "Spider-Man: Brand New Day",
      "genre": "Science Fiction",
      "year": 2026,
      "rating": 7.9,
      "poster": "https://image.tmdb.org/t/p/w342/bjiS5ipwxb9JFy3XRRN4OAilSeX.jpg"
    }
  ]
}
```

### POST /api/movies/{id}/reviews (body ที่หน้าเว็บส่ง)

```json
{ "text": "สนุกมาก ดูแล้วอยากดูภาคต่อ" }
```

ตอบกลับ 201 พร้อม `{ "id": 1, "text": "...", "createdAt": "2026-09-24T10:00:00Z" }`
ถ้า text สั้นกว่า 10 ตัวอักษร ตอบ 400 พร้อม `{ "error": "รีวิวสั้นเกินไป" }`

## เรื่องที่ต้องตกลงกัน

- CORS: ตอนพัฒนา หน้าเว็บอยู่ที่ http://localhost:3000 และโดเมน Vercel ของทีม ขอให้ backend อนุญาต 2 origin นี้
- Error: ทุก error ตอบ JSON รูปแบบเดียวกัน `{ "error": "ข้อความ" }`
- id ใช้เลขของ TMDB หรือเลขของเราเอง? (เลือก 1 อย่างแล้วใช้ให้เหมือนกันทุก endpoint)

> **လက်ရှိအကောင်အထည်ဖော်မှုအခြေအနေ (2026-10-20):** ဤစာတမ်းအောက်ပါ command များသည် လိုချင်သော target workflow ကိုဖော်ပြထားခြင်းဖြစ်ပြီး လက်ရှိ code တွင် အလုပ်လုပ်နေပြီဟု မဆိုလိုပါ။ လက်ရှိ `tgcloud/handlers/message.js` သည် echo scaffold သာဖြစ်ပြီး user onboarding/approval, admin commands, campaign management, incremental report delivery နှင့် scheduled reminders များ မပြီးသေးပါ။ လုံခြုံသော first-admin provisioning နှင့် authorization မပြည့်စုံမချင်း production deploy မလုပ်ပါနှင့်။ လက်ရှိရှိသော Mini App endpoint များသည် admin က post record ထည့်ရန်သာပါပြီး admin provisioning route မပါဝင်ပါ။

# Telegram Bot & Daily Post Record Guide

ဤ Bot သည် Client များအား စီမံခန့်ခွဲခြင်း၊ ကြော်ငြာ Channel ပို့စ်များကို Tab အလိုက် ရက် ၃၀ စာ သိမ်းဆည်းခြင်းနှင့် Client များထံသို့ Report အပိုင်းလိုက် ပေးပို့ခြင်း (Incremental Delivery) အတွက် ပြည့်စုံစွာ ရေးသားထားသော စနစ်ဖြစ်ပါသည်။

---

## ၁။ Bot တွင် ပါဝင်သော Command များနှင့် အသုံးပြုပုံ

### (က) ပထမဆုံး စတင်အသုံးပြုခြင်း & User စီမံခန့်ခွဲမှု
* `/start` — ပထမဆုံး Bot ကို စတင် run သော အသုံးပြုသူကို **Main Admin** အဖြစ် အလိုအလျောက် သတ်မှတ်ပေးပါသည်။
* အခြား Client များ `/start` နှိပ်ပါက စနစ်တွင် **Pending** အဖြစ် စောင့်ဆိုင်းနေမည်ဖြစ်ပြီး Admin ထံသို့ အသိပေးစာ ရောက်ရှိပါမည်။
* `/users` — User များကို **1 by 1 အသေးစိတ် စစ်ဆေးနိုင်သည့် Interactive Card** ပေါ်လာပါမည်။ `[⬅️ ရှေ့သို့]` `[နောက်သို့ ➡️]` ခလုတ်များဖြင့် တစ်ဦးချင်း ကြည့်ရှုနိုင်ပြီး `[✅ Approve]` သို့မဟုတ် `[❌ Reject]` ကို တိုက်ရိုက် နှိပ်နိုင်ပါသည်။
* `/user <Telegram_ID သို့မဟုတ် DB_ID>` — သတ်မှတ်ထားသော User တစ်ဦးတည်း၏ Profile အချက်အလက်ကို တိုက်ရိုက် ကြည့်ရှုစစ်ဆေးခြင်း။

### (ခ) Broadcast ပေးပို့ခြင်း
* `/broadcast <မက်ဆေ့ခ်ျ>` — အတည်ပြုပြီးသော (Approved) Client အားလုံးထံ စာတစ်ပြိုင်နက် ပို့ဆောင်ပေးပြီး အောင်မြင်/မအောင်မြင် အရေအတွက် အကျဉ်းချုပ် ပြန်လည်ပြသပေးပါသည်။
* `/sendto <Telegram_ID> <မက်ဆေ့ခ်ျ>` — သီးသန့် User တစ်ဦးတည်းထံ တိုက်ရိုက် မက်ဆေ့ခ်ျ ပို့ဆောင်ခြင်း။

### (ဂ) Tab ဖန်တီးခြင်းနှင့် Daily Post Link သိမ်းဆည်းခြင်း
* `/newtab <TabName> | <ChannelName> | <StartDate (Optional: YYYY-MM-DD)>`
  - ဥပမာ: `/newtab Ngwe Oah | Yangon Daily | 2026-09-24`
  - Start Date မထည့်ပါက ယနေ့ မြန်မာစံတော်ချိန် ရက်စွဲကို အလိုအလျောက် ယူပါမည်။
  - ရက်ပေါင်း ၃၀ သက်တမ်း သတ်မှတ်ပေးပါမည်။
* `/tabs` — လက်ရှိဖွင့်ထားသော Tab များ၊ Channel အမည်များနှင့် ယနေ့အထိ တင်ပြီးသမျှ ပို့စ်အရေအတွက် (ဥပမာ: 14/30 ရက်) ကို ပြသပေးပါသည်။
* `/addpost <TabName> <Telegram_Post_Link>`
  - ဥပမာ: `/addpost Ngwe Oah https://t.me/channel/123`
  - ယနေ့အတွက် Link အား အလိုအလျောက် သတ်မှတ်ပေးပြီး တစ်ရက်တည်းတွင် Link အသစ် ထပ်ထည့်ပါက အစားထိုး (Replace/Update) ပေးပါသည်။

### (ဃ) `/tabname` Report ကြည့်ရှုခြင်း & Send to Client (Incremental Delivery)
* `/<tabname>` (ဥပမာ: `/NgweOah` သို့မဟုတ် `/ngwe_oah`)
  - သက်ဆိုင်ရာ Tab ၏ အစီရင်ခံစာကို အောက်ပါ Format ဖြင့် ပြသပေးပါသည် -
    ```
    Date | Channel | Post Record
    ────────────────────────────
    2026-09-24 | Yangon Daily | Link ကြည့်ရန်
    2026-09-25 | Yangon Daily | Link ကြည့်ရန်
    ```
  - အောက်တွင် `[📤 Send to client]` Inline ခလုတ် ပါဝင်ပါသည်။
  - အဆိုပါခလုတ်ကို နှိပ်ပါက Approved Client စာရင်း ပေါ်လာမည်ဖြစ်ပြီး Client ကို ရွေးချယ်နှိပ်လိုက်ပါက:
    1. စနစ်က ယခင်က ထို Client ထံ **ဘယ်ရက်အထိ ပို့ပြီးပြီလဲ** ကို `report_deliveries` ထဲတွင် စစ်ဆေးပါသည်။
    2. **မပို့ရသေးသော ရက်သစ်များမှစ၍ ယနေ့အထိ Update အသစ်များကိုသာ** Client ထံ သီးသန့် စာပို့ပေးပါသည် (Duplicate မဖြစ်ပါ)။
    3. Update အသစ် မရှိပါက "အချက်အလက်အားလုံး ပို့ပြီးသားဖြစ်ပါသည်" ဟု Admin ထံ Alert ပြပေးပါသည်။

### (င) ရက် ၃၀ ပြည့်ပါက Auto-Delete ပြုလုပ်ခြင်း
- Campaign စတင်သည့်ရက်မှ ရက်ပေါင်း ၃၀ ကျော်လွန်သွားပါက နေ့စဉ် Post Link များကို Database ထဲမှ အလိုအလျောက် သန့်ရှင်းဖျက်ထုတ်ပေးပါသည် (`pruneExpiredPostRecords`)။

### (စ) ည ၁၀:၃၀ Reminder (Method 1)
- `/remindnow` — ည ၁၀:၃၀ သတိပေးချက်ကို ယခုချက်ချင်း စမ်းသပ်စစ်ဆေးနိုင်ပါသည်။
- ယနေ့အတွက် Link မထည့်ရသေးသော Tab များကို ရှာဖွေပြီး Admin များထံ သတိပေးချက် ပို့ပေးပါသည်။
- ပြင်ပ Cron အတွက် `.github/workflows/daily-reminder.yml` ဖိုင် ပါဝင်ပြီး နေ့စဉ် မြန်မာစံတော်ချိန် ည ၁၀:၃၀ (UTC 16:00) တွင် `endpoints/cronReminder.js` ကို အလိုအလျောက် run စေပါသည်။

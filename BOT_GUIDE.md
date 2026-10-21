# Telegram Bot နှင့် Daily Post Record အသုံးပြုနည်း

ဤလမ်းညွှန်သည် repository code ၏ လက်ရှိလုပ်ဆောင်ချက်များကို ဖော်ပြသည်။ Bot ကို production သို့ မတင်ရသေးပါ။ Admin Telegram ID များကို သီးသန့်တည်နေရာတွင် သတ်မှတ်ခြင်း၊ token အသစ်ထည့်ခြင်း၊ TGCloud app ချိတ်ဆက်ခြင်း၊ schema change စစ်ဆေးခြင်းနှင့် deploy လုပ်ခြင်းတို့ ကျန်ရှိနေပါသည်။

## Admin Telegram ID သတ်မှတ်ခြင်း

`tgcloud/lib/admin-config.js` ထဲရှိ `ADMIN_TELEGRAM_IDS` စာရင်းကို အသုံးပြုသည်။ Public GitHub ဗားရှင်းတွင် စာရင်းကို အလွတ်ထားပါ။ Admin လုပ်မည့် Telegram user ID များကို private deployment workspace ထဲတွင်သာ ထည့်ပြီး public repo သို့ commit မလုပ်ပါနှင့်။ စာရင်းထဲရှိသူ bot ကို `/start` လုပ်လျှင် approved admin ဖြစ်သည်။ အခြားသူများသည် pending client အဖြစ်သာ စာရင်းသွင်းမည်။

ID သည် Telegram account ကို ခွဲခြားသတ်မှတ်ရန် အသုံးပြုသော နံပါတ်ဖြစ်သည်။ Admin command များကို bot ၏ private chat မှသာ အသုံးပြုနိုင်သည်။ Password မလိုပါ။

Bot API token သို့မဟုတ် TGCloud CLI token ပေါက်ကြားခဲ့လျှင် အဟောင်းကို ပိတ်ပြီး အသစ်ထုတ်ပါ။ Token များကို source code, chat, log သို့ မထည့်ပါနှင့်။

## Onboarding နှင့် user review

- `/start` — user ကို မှတ်ပုံတင်ပြီး client အဖြစ် အတည်ပြုရန် စောင့်ဆိုင်းစာရင်းထဲ ထည့်သည်။ Admin ID စာရင်းထဲရှိသူသည် `/start` လုပ်ခြင်းဖြင့် admin ဖြစ်သည်။
- `/help` — အသုံးပြုသူအတွက် command များကို ပြသည်. Admin ဖြစ်ပါက admin command များကိုလည်း ပြသည်.
- `/users` — pending request များကို တစ်ခုချင်းကြည့်နိုင်သည့် inline card ဖော်ပြသည်. Approve/Reject ခလုတ်များဖြင့် ဆုံးဖြတ်နိုင်သည်.
- `/user <Telegram ID သို့မဟုတ် DB ID>` — user တစ်ဦး၏ profile/status ကြည့်သည်.
- `/approve <Telegram ID သို့မဟုတ် DB ID>` — client ကို approve သို့မဟုတ် ယခင် rejected status မှ ပြန်လည်ဖွင့်သည်.
- `/reject <Telegram ID သို့မဟုတ် DB ID>` — client access ကို ပိတ်သည်.

Admin command နှင့် callback များကို private chat မှ အတည်ပြုထားသော admin များသာ အသုံးပြုနိုင်သည်။ Group chat မှ admin command များ အသုံးပြု၍မရပါ။

## Client တစ်ဦး/အားလုံးထံ စာပို့ခြင်း

- `/sendto <Telegram ID> <message>` — approved client တစ်ဦးထံ စာပို့သည်.
- `/broadcast <message>` — approved client အားလုံးထံ စာပို့ပြီး အောင်မြင်/မအောင်မြင် အရေအတွက် ပြသည်.

Client က bot ကို အရင် `/start` မလုပ်ထားလျှင် Telegram က private message ပို့ခွင့်မပြုနိုင်ပါ။

## Campaign နှင့် Channel စီမံခန့်ခွဲခြင်း

- `/newtab <client Telegram ID> | <campaign အမည်> | <channel အမည်> [| <start YYYY-MM-DD>]` — approved client အတွက် 30 ရက်သက်တမ်းရှိ campaign နှင့် ပထမ channel တစ်ခု ဖန်တီးသည်. Start date မထည့်လျှင် Myanmar-local ယနေ့ရက်စွဲကို အသုံးပြုသည်.
- `/tabs` သို့မဟုတ် `/campaigns` — လက်ရှိ active campaign, client, budget, channel နှင့် ယနေ့ post မှတ်တမ်းအခြေအနေ ပြသည်.
- `/addchannel <campaign ID> | <channel အမည်> | <HTTPS URL သို့မဟုတ် ->` — campaign ထဲ channel ထည့်သည်. URL မရှိလျှင် `-` သုံးပါ.
- `/addpost <campaign ID> | <channel ID> | <https://t.me/... post link>` — ယနေ့အတွက် post link မှတ်တမ်းတင်သည်. Campaign/channel ID များကို `/newtab`, `/tabs` သို့မဟုတ် `/addchannel` မှ ရယူပါ. တစ် channel/တစ်နေ့အတွက် link အသစ်ပြန်ထည့်လျှင် ယခင် record ကို အစားထိုးသည်.
- `/budget <campaign ID> <amount Ks>` — အသုံးပြုထားသော budget ကို ပြင်သည်.
- `/endtab <campaign ID>` — campaign ကို ပြီးဆုံးအဖြစ် သတ်မှတ်ပြီး client ၏ active dashboard မှ ဖယ်ကာ history ထဲသို့ ရွှေ့သည်.

## Report ကြည့်ခြင်းနှင့် ပို့ခြင်း

- `/report <campaign ID သို့မဟုတ် အမည်>` — campaign report ကို ကြည့်သည်. Campaign အမည်အစား ID သုံးရန် အကြံပြုသည်.
- `/<campaign-name>` — slash command လုပ်နိုင်သောအမည်များကို space, `_`, `-` မပါဘဲ normalize လုပ်၍ report ရှာသည်. အမည်တူ campaign များရှိပါက `/report <ID>` သုံးပါ.
- Report အောက်ရှိ **Send to client** ကိုနှိပ်ပြီး approved client ကိုရွေးပါ. စနစ်သည် အဆိုပါ client/campaign အတွက် အောင်မြင်စွာ ပို့ပြီးသား Myanmar-local ရက်များကို ကျော်ပြီး မပို့ရသေးသောရက်များကိုသာ ပို့သည်.
- Telegram ထံ message အားလုံးပို့ပြီးနောက် delivery marker ကို database ထဲသိမ်းသည်. Telegram ပို့ပြီးသားဖြစ်သော်လည်း marker သိမ်းရာတွင် database error ဖြစ်ပါက နောက်တစ်ကြိမ်တွင် ထပ်ပို့နိုင်သည်; exactly-once delivery ကို အာမမခံပါ.

## 30 ရက် retention

Campaign စတင်ရက်မှ 30 ရက်ကျော်သော daily post-link record များကို Mini App dashboard/history/loyalty သို့မဟုတ် bot ၏ post/report request လာသည့်အချိန်တွင် ရှင်းလင်းသည်။ Campaign summary ကို ထိန်းသိမ်းထားသည်။ တိကျသည့်အချိန်တွင်အလိုအလျောက် run မည့် timer မဟုတ်ပါ။

## ည 10:30 Reminder — အချိန်ဇယားမရှိသေးပါ

- `/remindnow` — active campaign များထဲ ယနေ့ post record မရှိသေးသည့် channel များစာရင်းကို admin များထံ ယခုချက်ချင်း ပို့သည်။ Missing မရှိလျှင်လည်း ပြီးပြည့်စုံကြောင်း အသိပေးသည်.
- စစ်ဆေးခဲ့သော TGCloud official documentation တွင် cron/timer trigger ကို မဖော်ပြထားပါ။ ထို့ကြောင့် ည 10:30 Myanmar Standard Time အချိန်ဇယားကို code ထဲမှ တိုက်ရိုက် မစီစဉ်နိုင်သေးပါ။ အလိုအလျောက် reminder အတွက် TGCloud အပြင်ဘက်မှ အတည်ပြုထားသော scheduler/service တစ်ခုက endpoint သို့မဟုတ် bot trigger ကို ခေါ်ရမည်။

## Local validation နှင့် deployment

```bash
npm ci
npm run build
npm run lint
```

Deploy မတိုင်မီ admin Telegram ID များကို private local configuration ထဲတွင်သာ ထည့်ပါ။ Public GitHub ထဲ မတင်ပါနှင့်။ ပေါက်ကြားခဲ့သော token များကို ပိတ်ပြီး အသစ်ထုတ်ပါ။ TGCloud bot app ကို link/pull လုပ်ပြီး `npx tgcloud status` နှင့် schema diff ကို စစ်ဆေးပါ။ Migration ရှိလျှင် အပြောင်းအလဲစာရင်းကို စစ်ပြီးမှ run ပါ။

const TRADITIONAL_SIMPLIFIED_PAIRS =
  "愛爱礙碍寶宝報报備备筆笔畢毕幣币標标賓宾補补財财採采參参慘惨倉仓層层產产長长償偿廠厂車车陳陈" +
  "稱称懲惩衝冲蟲虫醜丑處处創创詞词從从聰聪達达帶带單单擔担彈弹當当黨党燈灯鄧邓敵敌點点電电" +
  "調调疊叠東东動动鬥斗獨独讀读斷断隊队對对噸吨奪夺爾尔發发罰罚範范飛飞廢废豐丰風风鳳凤" +
  "婦妇復复剛刚綱纲個个給给關关觀观廣广歸归龜龟國国過过漢汉號号華华畫画話话懷怀壞坏歡欢" +
  "環环還还會会彙汇獲获擊击機机積积極极際际濟济繼继紀纪記记價价堅坚間间簡简見见將将獎奖" +
  "講讲醬酱膠胶驕骄階阶節节傑杰潔洁結结儘尽緊紧進进晉晋經经驚惊競竞鏡镜舊旧據据舉举劇剧" +
  "覺觉軍军開开凱凯顆颗課课墾垦庫库塊块寬宽況况虧亏擴扩闊阔來来蘭兰藍蓝樂乐類类離离裡里" +
  "歷历厲厉麗丽勵励練练聯联戀恋煉炼糧粮靈灵領领劉刘龍龙樓楼錄录陸陆亂乱輪轮論论羅罗絡络" +
  "媽妈馬马買买賣卖麥麦脈脉貓猫貿贸麼么沒没門门夢梦彌弥祕秘廟庙滅灭鳴鸣謀谋難难鳥鸟寧宁" +
  "農农歐欧盤盘賠赔噴喷騙骗貧贫蘋苹憑凭撲扑鋪铺譜谱齊齐騎骑啟启氣气簽签錢钱潛潜淺浅槍枪" +
  "牆墙橋桥親亲輕轻慶庆窮穷區区權权勸劝確确讓让擾扰熱热認认榮荣軟软銳锐潤润賽赛傘伞喪丧" +
  "掃扫殺杀曬晒傷伤賞赏設设審审聖圣勝胜師师詩诗濕湿實实識识適适勢势獸兽書书術术樹树數数" +
  "雙双誰谁順顺說说碩硕絲丝飼饲鬆松蘇苏訴诉歲岁孫孙損损縮缩鎖锁態态談谈嘆叹湯汤燙烫討讨" +
  "騰腾鐵铁廳厅聽听頭头圖图團团萬万網网衛卫溫温穩稳問问無无務务誤误習习戲戏細细嚇吓鮮鲜" +
  "纖纤顯显險险現现線线鄉乡詳详響响項项蕭萧協协寫写謝谢興兴選选學学尋寻訓训壓压亞亚煙烟" +
  "嚴严鹽盐陽阳養养樣样搖摇藥药葉叶業业頁页億亿義义藝艺陰阴銀银隱隐營营應应嬰婴鷹鹰優优" +
  "郵邮猶犹遊游魚鱼與与語语預预園园圓圆願愿約约閱阅雲云雜杂災灾載载贊赞臟脏則则擇择澤泽" +
  "賊贼贈赠佔占戰战張张帳账漲涨趙赵這这針针鎮镇陣阵爭争徵征證证織织職职執执紙纸製制質质" +
  "終终鐘钟種种眾众週周豬猪燭烛屬属駐驻專专轉转莊庄裝装壯壮準准資资綜综總总縱纵組组鑽钻" +
  "邊边並并佈布澀涩滲渗湧涌盜盗蓋盖纏缠蹟迹鍊链鑒鉴閤阁闆板闢辟餵喂鹹咸麵面黴霉鬍胡鬚须";

const CHARACTER_MAP = new Map<string, string>();
for (let index = 0; index < TRADITIONAL_SIMPLIFIED_PAIRS.length; index += 2) {
  CHARACTER_MAP.set(
    TRADITIONAL_SIMPLIFIED_PAIRS[index],
    TRADITIONAL_SIMPLIFIED_PAIRS[index + 1],
  );
}

const GENERIC_MEDIA_WORDS = /(?:輕小說|轻小说|漫畫|漫画|動畫|动画|動漫|动漫|小說|小说|作品|系列|裡的|里的|中的)/gu;

export function traditionalToSimplifiedQuery(value: string): string {
  return [...value].map((character) => CHARACTER_MAP.get(character) ?? character).join("");
}

function cleanQuery(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\([^)]*\)|（[^）]*）/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function significantChineseTitle(value: string): string {
  return cleanQuery(value)
    .replace(GENERIC_MEDIA_WORDS, "")
    .replace(/第\s*[0-9〇零一二兩两三四五六七八九十]+\s*(?:季|期|部)/gu, "")
    .replace(/[^\p{Script=Han}]+/gu, "");
}

export function collectChineseDiscoveryQueries(value: string, limit = 5): string[] {
  const source = cleanQuery(value);
  if (!/\p{Script=Han}/u.test(source) || limit <= 0) return [];

  const output: string[] = [];
  const seen = new Set<string>();
  const add = (candidate: string): void => {
    const clean = cleanQuery(candidate);
    const key = clean.replace(/[\s\p{P}\p{S}]+/gu, "").toLocaleLowerCase();
    if (!clean || key.length < 2 || seen.has(key)) return;
    seen.add(key);
    output.push(clean);
  };

  const simplified = traditionalToSimplifiedQuery(source);
  const significant = significantChineseTitle(source);
  const simplifiedSignificant = traditionalToSimplifiedQuery(significant);

  add(simplified);
  add(significant);
  add(simplifiedSignificant);

  for (const candidate of [significant, simplifiedSignificant]) {
    const characters = [...candidate];
    if (characters.length > 3) add(characters.slice(-3).join(""));
    if (characters.length > 2) add(characters.slice(-2).join(""));
  }

  return output.slice(0, limit);
}

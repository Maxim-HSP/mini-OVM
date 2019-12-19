interface ArrayConstructor {
  from(arrayLike: any, mapFn?, thisArg?): Array<any>;
}

interface IMethods {
  [name: string]: () => any
}

interface I$opts {
  el?: string
}

interface IOpts extends I$opts {
  state: object,
  methods?: IMethods
}

class OVM implements IOpts {
  public state: object
  public $opts: I$opts

  constructor({ state, methods, ...restOpts }: IOpts) {
    // state
    this.state = state
    OVM.observe(this.state) // 实际直接传入this可以将this.state本身也劫持
    // methods
    if (methods) {
      Object.keys(methods).forEach(methodsName => {
        this[methodsName] = methods[methodsName] // 将所有方法代理到this
      })
    }
    // compile
    this.compile(restOpts.el)
    // backup
    this.$opts = restOpts
  }

  // 数据劫持，将每一个state对象作为目标被观察
  private static observe(state:object): void {
    if (!state || typeof state !== 'object') return
    Object.keys(state).forEach(key => {
      const sub = new Subject() // 每个state对象作为一个新目标
      let val = state[key] // 实际上这里算是将val闭包，然后通过setter、getter代理和劫持
      OVM.observe(val) // 递归以处理多维对象或数组
      Object.defineProperty(state, key, {
        // 以下特性值在调用defineProperty时，默认皆为false（常规情况下为true）
        enumerable: true, // 可枚举，循环
        configurable: true, // 可配置，删除
        // writable: false,  // 可修改，赋值(该属性与get、set不能同时设置)
        // 添加setter、getter以数据劫持
        get(): any {
          // 每当该目标属性被访问，且缓存有相应的watcher，则将watcher添加到观察者集合
          if (Subject.newWatcher) sub.add(Subject.newWatcher)
          return val
        },
        set(newVal: any) {
          if (val === newVal) return
          val = newVal // 赋值
          OVM.observe(newVal) // 处理赋值时，如果新值为引用类型需为他的属性添加set及get
          sub.notify(newVal) // 当该目标属性被更新，通知所有观察该目标的观察者并执行update方法
        }
      })
    })
    // console.log('subject', state, sub)
  }
  
  private compile(rootId: string) {
    // 将{{}}解析并替换数据到节点
    const replace = (node: HTMLElement | DocumentFragment) => {
      const reg = /\{\{([^}]+)\}\}/g
      node.childNodes.forEach((child: HTMLElement) => {
        // 元素节点则递归
        if (child.nodeType === 1) {
          replace(child)
          this.compileNode(child)
        } else if (reg.test(child.textContent)) {
          this.compileText(child, reg)
        }
      })
    }
    // 使用文档碎片缓存所有节点再进行处理，节约性能
    const rootEl = document.querySelector(rootId)
    const fregment = document.createDocumentFragment()
    let child: any
    while(child = rootEl.firstChild) {
      // appendChild会将原本的节点移动到目标节点
      fregment.appendChild(child)
    }
    replace(fregment)
    // 处理完成后再将文档碎片放入实际Dom节点中
    rootEl.appendChild(fregment)
  }

  // 文本节点编译方法
  private compileText(node: HTMLElement, reg: RegExp) {
    // [magic code] 利用循环产生的作用域，闭包原始的textContent（即包含{{}}的模版节点）
    const template = node.textContent
    const update = (newVal?: any) => {
      // String.replace方法第一个参数如果是正则，则当第二个参数为回调函数时，可以被多次匹配（即多次调用）
      // 这个回调函数的参数：match指被匹配到的整个子串，key则为正则当中括号匹配的字符串（如果有多个括号，则递增回调参数）
      // 不过这种方法的缺陷是不能够再使用newVal去替换值，因为如果是多个{{}}在同一元素内排列，则会将所有{{}}内的值都换为newValue
      node.textContent = template.replace(reg, (match, key) => {
        // 触发getter前，先通过Subject.watcher缓存观察者（因为不能在getter传参）
        // [magic code] 将函数本身作为值传递到watcher，递归调用，实现template闭包
        if (!newVal) Subject.newWatcher = { update, key }
        // 取出值，同时触发相应state的getter以添加观察者（Subject.newWatcher），兼容state.a.b等深层属性
        const val = key.trim().split('.').reduce((prev, next) => (prev[next]), this.state)
        // console.log(match, val, newVal)
        // 清除缓存
        Subject.newWatcher = null
        // 返回值替换
        return val
      })
    }
    update() // 初始化替换（无newVal）
  }

  // 依据属性的节点编译方法
  private compileNode(node: HTMLElement) {
    Array.from(node.attributes).forEach(attr => {
      const { name, value } = attr
      if(name.includes('@')) {
        // 事件属性
        node.addEventListener(name.replace('@', ''), this[value].bind(this))
      } else if (name.includes(':')) {
        // 普通属性
        const realAttr = name.replace(':', '')
        // 缓存观察者
        Subject.newWatcher = {
          key: String(attr),
          update: (newVal) => {
            node[realAttr] = newVal
          }
        }
        // 触发getter，添加观察者
        const realVal = value.trim().split('.').reduce((prev, next) => (prev[next]), this.state)
        Subject.newWatcher = null
        // 值替换
        node[realAttr] = realVal
      }
    });
  }
}

/**
 * 观察者 -> 目标
 * 视图 -> 数据
 * node -> state
 * [TIP] 在MVVM模式下，一个数据（目标）发生改变会通知到所有观察该数据的视图(watcher)
 */

interface watcher {
  update: (newVal: any) => any
  key: string
}
// 目标类
class Subject {
  private watchers: watcher[]
  // 用于缓存新观察者
  public static newWatcher: watcher

  constructor() {
    this.watchers = []
  }

  // 添加观察者
  public add(watcher: any) {
    this.watchers.push(watcher)
  }

  // 通知更新
  public notify(newVal: any) {
    this.watchers.forEach(watcher => watcher.update(newVal))
  }
}

// 观察者类
class Watcher {
  update() {
    
  }
}

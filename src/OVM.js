var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var OVM = /** @class */ (function () {
    function OVM(_a) {
        var _this = this;
        var state = _a.state, methods = _a.methods, restOpts = __rest(_a, ["state", "methods"]);
        // state
        this.state = state;
        OVM.observe(this.state); // 实际直接传入this可以将this.state本身也劫持
        // methods
        if (methods) {
            Object.keys(methods).forEach(function (methodsName) {
                _this[methodsName] = methods[methodsName]; // 将所有方法代理到this
            });
        }
        // compile
        this.compile(restOpts.el);
        // backup
        this.$opts = restOpts;
    }
    // 数据劫持，将每一个state对象作为目标被观察
    OVM.observe = function (state) {
        if (!state || typeof state !== 'object')
            return;
        Object.keys(state).forEach(function (key) {
            var sub = new Subject(); // 每个state对象作为一个新目标
            var val = state[key]; // 实际上这里算是将val闭包，然后通过setter、getter代理和劫持
            OVM.observe(val); // 递归以处理多维对象或数组
            Object.defineProperty(state, key, {
                // 以下特性值在调用defineProperty时，默认皆为false（常规情况下为true）
                enumerable: true,
                configurable: true,
                // writable: false,  // 可修改，赋值(该属性与get、set不能同时设置)
                // 添加setter、getter以数据劫持
                get: function () {
                    // 每当该目标属性被访问，且缓存有相应的watcher，则将watcher添加到观察者集合
                    if (Subject.newWatcher)
                        sub.add(Subject.newWatcher);
                    return val;
                },
                set: function (newVal) {
                    if (val === newVal)
                        return;
                    val = newVal; // 赋值
                    OVM.observe(newVal); // 处理赋值时，如果新值为引用类型需为他的属性添加set及get
                    sub.notify(newVal); // 当该目标属性被更新，通知所有观察该目标的观察者并执行update方法
                }
            });
        });
        // console.log('subject', state, sub)
    };
    OVM.prototype.compile = function (rootId) {
        var _this = this;
        // 将{{}}解析并替换数据到节点
        var replace = function (node) {
            var reg = /\{\{([^}]+)\}\}/g;
            node.childNodes.forEach(function (child) {
                // 元素节点则递归
                if (child.nodeType === 1) {
                    replace(child);
                    _this.compileNode(child);
                }
                else if (reg.test(child.textContent)) {
                    _this.compileText(child, reg);
                }
            });
        };
        // 使用文档碎片缓存所有节点再进行处理，节约性能
        var rootEl = document.querySelector(rootId);
        var fregment = document.createDocumentFragment();
        var child;
        while (child = rootEl.firstChild) {
            // appendChild会将原本的节点移动到目标节点
            fregment.appendChild(child);
        }
        replace(fregment);
        // 处理完成后再将文档碎片放入实际Dom节点中
        rootEl.appendChild(fregment);
    };
    // 文本节点编译方法
    OVM.prototype.compileText = function (node, reg) {
        var _this = this;
        // [magic code] 利用循环产生的作用域，闭包原始的textContent（即包含{{}}的模版节点）
        var template = node.textContent;
        var update = function (newVal) {
            // String.replace方法第一个参数如果是正则，则当第二个参数为回调函数时，可以被多次匹配（即多次调用）
            // 这个回调函数的参数：match指被匹配到的整个子串，key则为正则当中括号匹配的字符串（如果有多个括号，则递增回调参数）
            // 不过这种方法的缺陷是不能够再使用newVal去替换值，因为如果是多个{{}}在同一元素内排列，则会将所有{{}}内的值都换为newValue
            node.textContent = template.replace(reg, function (match, key) {
                // 触发getter前，先通过Subject.watcher缓存观察者（因为不能在getter传参）
                // [magic code] 将函数本身作为值传递到watcher，递归调用，实现template闭包
                if (!newVal)
                    Subject.newWatcher = { update: update, key: key };
                // 取出值，同时触发相应state的getter以添加观察者（Subject.newWatcher），兼容state.a.b等深层属性
                var val = key.trim().split('.').reduce(function (prev, next) { return (prev[next]); }, _this.state);
                // console.log(match, val, newVal)
                // 清除缓存
                Subject.newWatcher = null;
                // 返回值替换
                return val;
            });
        };
        update(); // 初始化替换（无newVal）
    };
    // 依据属性的节点编译方法
    OVM.prototype.compileNode = function (node) {
        var _this = this;
        Array.from(node.attributes).forEach(function (attr) {
            var name = attr.name, value = attr.value;
            if (name.includes('@')) {
                // 事件属性
                node.addEventListener(name.replace('@', ''), _this[value].bind(_this));
            }
            else if (name.includes(':')) {
                // 普通属性
                var realAttr_1 = name.replace(':', '');
                // 缓存观察者
                Subject.newWatcher = {
                    key: String(attr),
                    update: function (newVal) {
                        node[realAttr_1] = newVal;
                    }
                };
                // 触发getter，添加观察者
                var realVal = value.trim().split('.').reduce(function (prev, next) { return (prev[next]); }, _this.state);
                Subject.newWatcher = null;
                // 值替换
                node[realAttr_1] = realVal;
            }
        });
    };
    return OVM;
}());
// 目标类
var Subject = /** @class */ (function () {
    function Subject() {
        this.watchers = [];
    }
    // 添加观察者
    Subject.prototype.add = function (watcher) {
        this.watchers.push(watcher);
    };
    // 通知更新
    Subject.prototype.notify = function (newVal) {
        this.watchers.forEach(function (watcher) { return watcher.update(newVal); });
    };
    return Subject;
}());
// 观察者类
var Watcher = /** @class */ (function () {
    function Watcher() {
    }
    Watcher.prototype.update = function () {
    };
    return Watcher;
}());

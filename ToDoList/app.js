    //状态
    let filter = 'all'
    let searchKeyword = ''
    let categoryFilter = 'all'

    // 数据：所有待办都存在这个数组里
    const todos = JSON.parse(localStorage.getItem('todos') || '[]')

    // 获取页面元素
    const input = document.getElementById('todoInput')
    const addBtn = document.getElementById('addBtn')
    const list = document.getElementById('todoList')
    const searchInput = document.getElementById('searchInput')
    const categoryFilterSelect = document.getElementById('categoryFilter')
    const categorySelect = document.getElementById('categorySelect')
    const statsEl = document.getElementById('stats')


    // 渲染函数：根据 todos 数组，重新画出整个列表
    function render() {
      save()
      list.innerHTML = ''  // 先清空

      getFilteredTodos().forEach((todo, index) => {
        const li = document.createElement('li')

        //分类标签
        const categoryTag = document.createElement('span')
        categoryTag.className = 'category-tag'
        categoryTag.textContent = todo.category || '未分类'
        
        // 文字
        const span = document.createElement('span')
        span.textContent = todo.text
        if (todo.done) span.classList.add('done')
        

        // 完成/取消按钮
        const doneBtn = document.createElement('button')
        doneBtn.textContent = todo.done ? '取消' : '完成'
        doneBtn.addEventListener('click', () => {
          todo.done = !todo.done
          render()
        })

        // 删除按钮
        const delBtn = document.createElement('button')
        delBtn.textContent = '删除'
        delBtn.addEventListener('click', () => {
          const realIndex = todos.indexOf(todo)
          todos.splice(realIndex, 1)
          render()
        })

        li.appendChild(categoryTag)
        li.appendChild(span)
        li.appendChild(doneBtn)
        li.appendChild(delBtn)
        list.appendChild(li)
      })
      
        // 统计
      const total = todos.length
      const doneCount = todos.filter(t => t.done).length
      document.getElementById('stats').textContent = `共 ${total} 条，已完成 ${doneCount} 条`

       // 高亮当前筛选按钮
      document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter)
      })
    }

    function save(){
        localStorage.setItem('todos', JSON.stringify(todos))
    }

    function getFilteredTodos() {
      let filtered = todos

      if(searchKeyword) {
        filtered = filtered.filter(t => t.text.toLowerCase().includes(searchKeyword.toLowerCase()))
      }
      if (categoryFilter !== 'all') {
        filtered = filtered.filter(t => t.category === categoryFilter)
      }
      if (filter ==='active') return filtered.filter(t => !t.done)
      if (filter ==='done') return filtered.filter(t => t.done)
      return filtered
    }

    // 添加待办
    addBtn.addEventListener('click', () => {
      const text = input.value.trim()
      if (!text) return          // 空内容不添加
      todos.push({ text: text, done: false, category: categorySelect.value})
      input.value = ''           // 清空输入框
      render()                   // 重新渲染
    })

    // 筛选按钮
    document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        filter = btn.dataset.filter
        render()
        })
    })

    // 按回车也能添加
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        addBtn.click()
      }
    })

    //搜索
    searchInput.addEventListener('input', (e) => {
      searchKeyword = e.target.value.trim()
      render()
    })

    //分类筛选
    categoryFilterSelect.addEventListener('change', (e) => {
      categoryFilter = e.target.value
      render()
    }) 

    render()